import type { AgentSnapshot, CursorWindowSnapshot, OfficeBootstrap, OfficeOwner, UsageLedgerSnapshot } from '../contracts';
import { roleColors, statusColors, statusLabels, visualRoleFor } from '../contracts';
import { colorToCss, escapeHtml, requireElement } from './dom';

export class OfficeHud {
  public readonly canvas: HTMLCanvasElement;

  private readonly agentList: HTMLElement;
  private readonly ownerCard: HTMLElement;
  private readonly detailPanel: HTMLElement;
  private readonly windowFilter: HTMLSelectElement;
  private readonly agentStates = new Map<string, AgentSnapshot>();
  private ownerState: OfficeOwner | undefined;
  private usageState: UsageLedgerSnapshot | undefined;
  private selectedId: string | undefined;
  private showUsageDetails = false;

  public constructor(
    private readonly root: HTMLDivElement,
    private readonly onSelectionRequested: (id?: string) => void,
    private readonly onWindowFilterRequested: (windowId: string) => void
  ) {
    root.innerHTML = `
      <main class="office-shell">
        <canvas class="office-canvas" aria-label="3D kancelář agentů"></canvas>
        <header class="office-topbar">
          <div class="brand-card glass-card">
            <span class="brand-mark">CO</span>
            <span class="brand-copy">
              <strong>Cursor Office</strong>
              <span>lokální tým v reálném čase</span>
            </span>
          </div>
          <section class="metric-strip glass-card" aria-label="Souhrn kanceláře">
            <span><strong data-metric="total">0</strong> agenti</span>
            <span><strong data-metric="working">0</strong> pracují</span>
            <span><strong data-metric="attention">0</strong> čekají</span>
            <button class="usage-metric" type="button" aria-label="Otevřít přehled spotřeby"><strong data-metric="usage">0</strong> tokenů*</button>
          </section>
        </header>

        <aside class="people-panel glass-card">
          <div class="panel-heading">
            <span>Tým</span>
            <span class="live-badge"><i></i> LIVE</span>
          </div>
          <label class="window-filter-row">
            <span>POHLED</span>
            <select class="window-filter" aria-label="Filtrovat podle Cursor okna">
              <option value="all">Všechna Cursor okna</option>
            </select>
          </label>
          <section class="owner-card" aria-label="Majitel kanceláře" role="button" tabindex="0"></section>
          <div class="panel-divider"></div>
          <section class="agent-list" aria-label="Seznam agentů"></section>
        </aside>

        <footer class="office-footer glass-card">
          <span class="legend-group" aria-label="Role postav podle stálé barvy košile a odznaku">
            <b class="legend-title">ROLE · KOŠILE / ODZNAK</b>
            <span><i class="legend-dot role-dot" style="--legend-color: ${colorToCss(roleColors.owner)}"></i>Majitel</span>
            <span><i class="legend-dot role-dot" style="--legend-color: ${colorToCss(roleColors.manager)}"></i>Manažer</span>
            <span><i class="legend-dot role-dot" style="--legend-color: ${colorToCss(roleColors.chat)}"></i>Chat / senior</span>
            <span><i class="legend-dot role-dot" style="--legend-color: ${colorToCss(roleColors.subagent)}"></i>Subagent</span>
          </span>
          <span class="legend-separator" aria-hidden="true"></span>
          <span class="legend-group" aria-label="Runtime stav podle barvy světelného kruhu">
            <b class="legend-title">STAV · KRUH</b>
            <span><i class="legend-dot status-dot" style="--legend-color: ${colorToCss(statusColors.unknown)}"></i>Neznámý</span>
            <span><i class="legend-dot status-dot" style="--legend-color: ${colorToCss(statusColors.idle)}"></i>Volný</span>
            <span><i class="legend-dot status-dot" style="--legend-color: ${colorToCss(statusColors.working)}"></i>Pracuje</span>
            <span><i class="legend-dot status-dot" style="--legend-color: ${colorToCss(statusColors.waitingForUser)}"></i>Čeká</span>
            <span><i class="legend-dot status-dot" style="--legend-color: ${colorToCss(statusColors.error)}"></i>Problém</span>
            <span><i class="legend-dot status-dot" style="--legend-color: ${colorToCss(statusColors.completed)}"></i>Hotovo</span>
            <span><i class="legend-dot status-dot" style="--legend-color: ${colorToCss(statusColors.offline)}"></i>Offline</span>
          </span>
          <span class="footer-note">Levé tažení: úhel · kolečko + tažení: posun · kolečko: zoom · WASD: kamera · Q/E: otočení · Home: výchozí pohled · Esc: režim kamery</span>
        </footer>

        <section class="detail-panel glass-card" aria-live="polite" hidden></section>
      </main>`;

    this.canvas = requireElement<HTMLCanvasElement>(root, '.office-canvas');
    this.agentList = requireElement<HTMLElement>(root, '.agent-list');
    this.ownerCard = requireElement<HTMLElement>(root, '.owner-card');
    this.detailPanel = requireElement<HTMLElement>(root, '.detail-panel');
    this.windowFilter = requireElement<HTMLSelectElement>(root, '.window-filter');
    this.windowFilter.addEventListener('change', () => this.onWindowFilterRequested(this.windowFilter.value));
    requireElement<HTMLButtonElement>(root, '.usage-metric').addEventListener('click', () => {
      this.showUsageDetails = true;
      this.selectedId = undefined;
      this.onSelectionRequested();
      this.renderDetails();
      this.updateSelectionVisuals();
    });

    this.ownerCard.addEventListener('click', () => this.onSelectionRequested('owner'));
    this.ownerCard.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.onSelectionRequested('owner');
      }
    });

    this.agentList.addEventListener('click', event => this.selectAgentFromEvent(event));
    this.agentList.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.selectAgentFromEvent(event);
      }
    });
  }

  public applyBootstrap(bootstrap: OfficeBootstrap): void {
    this.updateWindowFilter(bootstrap.windows, bootstrap.currentWindow, bootstrap.agents);
    this.updateOwner(bootstrap.owner);
    this.updateAgents(bootstrap.agents);
    this.updateUsage(bootstrap.usage);
  }

  private updateWindowFilter(
    windows: CursorWindowSnapshot[] | undefined,
    currentWindow: CursorWindowSnapshot | undefined,
    agents: AgentSnapshot[]
  ): void {
    const selected = this.windowFilter.value || 'all';
    const options = new Map<string, { label: string; isCurrent: boolean; isFocused: boolean }>();
    for (const window of [...(windows ?? []), ...(currentWindow ? [currentWindow] : [])]) {
      options.set(window.id, {
        label: window.label,
        isCurrent: window.isCurrent === true || window.id === currentWindow?.id,
        isFocused: window.isFocused
      });
    }
    let hasUnassigned = false;
    for (const agent of agents) {
      if (!agent.windowId) {
        hasUnassigned = true;
        continue;
      }
      if (!options.has(agent.windowId)) {
        options.set(agent.windowId, {
          label: agent.windowLabel ?? `Cursor okno ${agent.windowId.slice(-5)}`,
          isCurrent: agent.windowId === currentWindow?.id,
          isFocused: false
        });
      }
    }
    const rows = [...options.entries()]
      .sort(([, left], [, right]) => {
        if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1;
        if (left.isFocused !== right.isFocused) return left.isFocused ? -1 : 1;
        return left.label.localeCompare(right.label, 'cs');
      })
      .map(([id, window]) => `<option value="${escapeHtml(id)}">${escapeHtml(`${window.label}${window.isCurrent ? ' · toto okno' : window.isFocused ? ' · aktivní' : ''}`)}</option>`);
    if (hasUnassigned) {
      rows.push('<option value="unassigned">Nezařazené konverzace</option>');
    }
    this.windowFilter.innerHTML = `<option value="all">Všechna Cursor okna</option>${rows.join('')}`;
    this.windowFilter.value = [...this.windowFilter.options].some(option => option.value === selected)
      ? selected
      : 'all';
  }

  public select(id?: string): void {
    this.selectedId = id;
    if (id) {
      this.showUsageDetails = false;
    }
    this.renderDetails();
    this.updateSelectionVisuals();
  }

  private updateOwner(owner: OfficeOwner): void {
    this.ownerState = owner;
    this.ownerCard.innerHTML = `
      <div class="owner-emblem">♛</div>
      <span class="owner-copy">
        <small>MAJITEL</small>
        <strong>${escapeHtml(owner.displayName)}</strong>
        <span>${escapeHtml(owner.role)}</span>
      </span>
      <span class="owner-presence">V kanceláři</span>`;

    if (this.selectedId === 'owner') {
      this.renderDetails();
    }
  }

  private updateAgents(agents: AgentSnapshot[]): void {
    this.agentStates.clear();
    agents.forEach(agent => this.agentStates.set(agent.id, agent));
    const orderedAgents = [...agents].sort((left, right) => {
      const workspace = (left.workspace ?? left.role).localeCompare(right.workspace ?? right.role, 'cs');
      if (workspace !== 0) return workspace;
      const leftKind = left.kind ?? 'primary';
      const rightKind = right.kind ?? 'primary';
      if (leftKind !== rightKind) return leftKind === 'subagent' ? 1 : -1;
      return left.displayName.localeCompare(right.displayName, 'cs');
    });

    const workspaceGroups = new Map<string, AgentSnapshot[]>();
    for (const agent of orderedAgents) {
      const workspace = agent.workspace?.trim() || 'Neznámý workspace';
      const group = workspaceGroups.get(workspace) ?? [];
      group.push(agent);
      workspaceGroups.set(workspace, group);
    }
    this.agentList.innerHTML = [...workspaceGroups.entries()]
      .map(([workspace, workspaceAgents]) => {
        const workspacePath = workspaceAgents.find(agent => agent.workspacePath)?.workspacePath;
        const working = workspaceAgents.filter(agent => agent.status === 'working').length;
        const windowGroups = new Map<string, AgentSnapshot[]>();
        for (const agent of workspaceAgents) {
          const key = agent.windowId ?? 'unassigned';
          const windowAgents = windowGroups.get(key) ?? [];
          windowAgents.push(agent);
          windowGroups.set(key, windowAgents);
        }
        const rows = [...windowGroups.entries()].map(([windowId, windowAgents]) => {
          const primaries = windowAgents.filter(agent => agent.kind !== 'subagent');
          const children = windowAgents.filter(agent => agent.kind === 'subagent');
          const childrenByParent = new Map<string, AgentSnapshot[]>();
          for (const child of children) {
            if (!child.parentAgentId) continue;
            const siblings = childrenByParent.get(child.parentAgentId) ?? [];
            siblings.push(child);
            childrenByParent.set(child.parentAgentId, siblings);
          }
          const ordered: AgentSnapshot[] = [];
          const depths = new Map<string, number>();
          const visited = new Set<string>();
          const appendTree = (agent: AgentSnapshot, depth: number): void => {
            if (visited.has(agent.id)) return;
            visited.add(agent.id);
            ordered.push(agent);
            depths.set(agent.id, depth);
            for (const child of childrenByParent.get(agent.id) ?? []) {
              appendTree(child, depth + 1);
            }
          };
          primaries.forEach(primary => appendTree(primary, 0));
          windowAgents.filter(agent => !visited.has(agent.id))
            .forEach(agent => appendTree(agent, agent.kind === 'subagent' ? 1 : 0));
          const label = windowAgents.find(agent => agent.windowLabel)?.windowLabel
            ?? (windowId === 'unassigned' ? 'Nezařazené konverzace' : `Cursor okno ${windowId.slice(-5)}`);
          const managers = primaries.length;
          const agentRows = ordered.map(agent => {
            const color = colorToCss(statusColors[agent.status]);
            const selectedClass = this.selectedId === agent.id ? ' selected' : '';
            const visualRole = visualRoleFor(agent);
            const kindClass = agent.kind === 'subagent' ? ' subagent' : ' primary-agent';
            const depth = Math.min(depths.get(agent.id) ?? 0, 3);
            const depthClass = ` depth-${depth}`;
            const avatar = visualRole === 'manager'
              ? 'M'
              : visualRole === 'subagent'
                ? '↳'
                : agent.role.includes('senior / koordinátor') ? 'S' : 'A';
            const model = formatAgentModel(agent);
            const tokens = formatAgentTokens(agent);
            return `<article class="agent-row${kindClass} role-${visualRole}${depthClass}${selectedClass}" data-agent-id="${escapeHtml(agent.id)}" role="button" tabindex="0" style="--agent-color: ${color}; --role-color: ${colorToCss(roleColors[visualRole])}">
          <span class="agent-avatar">${escapeHtml(avatar)}</span>
          <span class="agent-copy">
            <span class="agent-name-line">
              <strong>${escapeHtml(agent.displayName)}</strong>
              <small>${escapeHtml(statusLabels[agent.status])}</small>
            </span>
            <span class="agent-task">${escapeHtml(agent.currentTask ?? agent.role)}</span>
            <span class="agent-meta"><em class="agent-model">${escapeHtml(model)}</em><small class="agent-tokens">${escapeHtml(tokens)}</small></span>
          </span>
          </article>`;
          }).join('');
          return `<section class="window-group">
            <header class="window-heading" title="${escapeHtml(label)}">
              <span><i></i>${escapeHtml(label)}</span><small>${escapeHtml(formatManagerCount(managers))}</small>
            </header>
            ${agentRows}
          </section>`;
        }).join('');
        return `<section class="workspace-group">
          <header class="workspace-heading" title="${escapeHtml(workspacePath ?? workspace)}">
            <span><small>MÍSTNOST / WORKSPACE</small><strong>${escapeHtml(workspace)}</strong></span>
            <em>${working}/${workspaceAgents.length} pracuje</em>
          </header>
          ${rows}
        </section>`;
      })
      .join('');

    const workingCount = agents.filter(agent => agent.status === 'working').length;
    const attentionCount = agents.filter(agent =>
      agent.status === 'waitingForUser' || agent.status === 'error'
    ).length;
    requireElement<HTMLElement>(this.root, '[data-metric="total"]').textContent = String(agents.length);
    requireElement<HTMLElement>(this.root, '[data-metric="working"]').textContent = String(workingCount);
    requireElement<HTMLElement>(this.root, '[data-metric="attention"]').textContent = String(attentionCount);

    if (this.selectedId && this.selectedId !== 'owner' && !this.agentStates.has(this.selectedId)) {
      this.onSelectionRequested();
      return;
    }

    this.renderDetails();
  }

  private updateUsage(usage?: UsageLedgerSnapshot): void {
    this.usageState = usage;
    const metric = requireElement<HTMLElement>(this.root, '[data-metric="usage"]');
    metric.textContent = formatTokens(usage?.total.totalTokens ?? 0);
    const container = metric.closest<HTMLElement>('.usage-metric');
    if (container) {
      const workspace = usage?.byWorkspace[0];
      const model = usage?.byModel[0];
      container.title = usage && usage.total.requestCount > 0
        ? `Lokálně zaznamenáno: ${usage.total.requestCount} generací${workspace ? ` · nejvíce ${workspace.key}` : ''}${model ? ` · ${model.key}` : ''}`
        : 'Cursor zatím neposlal přesná tokenová data. *Zobrazeny jsou pouze doložené terminální události.';
    }
    this.renderDetails();
  }

  private selectAgentFromEvent(event: Event): void {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-agent-id]');
    if (row?.dataset.agentId) {
      this.onSelectionRequested(row.dataset.agentId);
    }
  }

  private renderDetails(): void {
    if (this.showUsageDetails) {
      this.renderUsageDetails();
      return;
    }
    this.detailPanel.classList.remove('usage-details');
    if (!this.selectedId) {
      this.detailPanel.hidden = true;
      return;
    }

    if (this.selectedId === 'owner' && this.ownerState) {
      const recordedUsage = this.usageState && this.usageState.total.requestCount > 0
        ? ` Lokální ledger zatím eviduje ${formatTokens(this.usageState.total.totalTokens)} tokenů v ${this.usageState.total.requestCount} generacích.`
        : ' Přesné tokenové údaje zatím Cursor neposlal.';
      this.detailPanel.innerHTML = `
        <button class="detail-close" type="button" aria-label="Zavřít detail">×</button>
        <span class="detail-kicker owner-kicker">MAJITEL KANCELÁŘE</span>
        <h2>${escapeHtml(this.ownerState.displayName)}</h2>
        <p>${escapeHtml(this.ownerState.role)}</p>
        <div class="detail-status"><i style="--detail-color: ${escapeHtml(this.ownerState.accent)}"></i> Přítomen a řídí tým</div>
        <div class="detail-note">Majitel má vlastní pracovní místo. WASD po jeho výběru řídí postavu; Esc vrátí ovládání klávesami kameře. Bez výběru jej pošlete na místo kliknutím na volnou podlahu.${escapeHtml(recordedUsage)}</div>`;
    } else {
      const agent = this.agentStates.get(this.selectedId);
      if (!agent) {
        this.detailPanel.hidden = true;
        return;
      }

      const statusColor = colorToCss(statusColors[agent.status]);
      const parent = agent.parentAgentId ? this.agentStates.get(agent.parentAgentId) : undefined;
      const isWindowManager = agent.id.startsWith('cursor-window-manager-');
      const isChatAgent = parent?.id.startsWith('cursor-window-manager-') === true;
      const hierarchy = isWindowManager
        ? 'MANAŽER CURSOR OKNA'
        : isChatAgent
          ? agent.role.includes('senior / koordinátor') ? 'VEDOUCÍ AGENT' : 'PRACOVNÍ AGENT'
          : agent.kind === 'subagent' ? 'PODAGENT / PRACOVNÍK' : 'NEZAŘAZENÝ AGENT';
      const workspace = agent.workspace ?? agent.role;
      const workspaceLedgerKey = agent.workspacePath ?? agent.workspace;
      const workspaceUsage = this.usageState?.byWorkspace.find(bucket => bucket.key === workspaceLedgerKey);
      const modelValue = formatAgentModel(agent, true);
      const usageTitle = isWindowManager ? 'TÝM / WORKSPACE · DOLOŽENO' : 'AGENT · POSLEDNÍ GENERACE';
      const usageValue = agent.usage
        ? `${formatTokens(agent.usage.totalTokens)} tokenů`
        : agent.status === 'working' ? 'po dokončení generace' : 'Cursor neposlal';
      const workspaceUsageFact = isWindowManager ? '' : `
          <span><small>WORKSPACE · ZAZNAMENÁNO</small><strong>${escapeHtml(workspaceUsage ? `${formatTokens(workspaceUsage.totalTokens)} tokenů` : 'čeká na první doloženou generaci')}</strong></span>`;
      const conversationFact = agent.conversationTitle ? `
          <span><small>CHAT</small><strong title="${escapeHtml(agent.conversationTitle)}">${escapeHtml(agent.conversationTitle)}</strong></span>` : '';
      const metadata = [
        agent.detail,
        agent.windowLabel ? `Cursor okno: ${agent.windowLabel}` : 'Cursor okno nezjištěno',
        agent.isParallelWorker ? 'Paralelní pracovník' : undefined
      ].filter(Boolean).join(' · ');
      this.detailPanel.innerHTML = `
        <button class="detail-close" type="button" aria-label="Zavřít detail">×</button>
        <span class="detail-kicker">${escapeHtml(`${workspace} · ${hierarchy}`)}</span>
        <h2>${escapeHtml(agent.displayName)}</h2>
        <p>${escapeHtml(agent.currentTask ?? 'Bez aktuálního úkolu')}</p>
        <div class="detail-status"><i style="--detail-color: ${statusColor}"></i> ${escapeHtml(statusLabels[agent.status])}</div>
        <div class="detail-facts">
          ${conversationFact}
          <span><small>${isWindowManager ? 'MODELY TÝMU' : 'MODEL'}</small><strong title="${escapeHtml(modelValue)}">${escapeHtml(modelValue)}</strong></span>
          <span><small>${escapeHtml(usageTitle)}</small><strong>${escapeHtml(usageValue)}</strong></span>
          <span><small>WORKSPACE / REPO</small><strong title="${escapeHtml(agent.workspacePath ?? workspace)}">${escapeHtml(workspace)}</strong></span>
          <span><small>CURSOR OKNO</small><strong title="${escapeHtml(agent.windowId ?? 'nezjištěno')}">${escapeHtml(agent.windowLabel ?? 'nezjištěno')}</strong></span>
          ${workspaceUsageFact}
        </div>
        <div class="detail-note">${escapeHtml(metadata || 'Pozice a animace postavy jsou řízené aktuálním stavem agenta.')}</div>`;
    }

    this.detailPanel.hidden = false;
    requireElement<HTMLButtonElement>(this.detailPanel, '.detail-close')
      .addEventListener('click', () => this.onSelectionRequested(), { once: true });
  }

  private renderUsageDetails(): void {
    const usage = this.usageState;
    const hasExactUsage = Boolean(usage && usage.total.requestCount > 0);
    this.detailPanel.classList.add('usage-details');
    this.detailPanel.innerHTML = `
      <button class="detail-close" type="button" aria-label="Zavřít přehled">×</button>
      <span class="detail-kicker">LOKÁLNÍ LEDGER · POUZE DOLOŽENÁ DATA</span>
      <h2>Spotřeba modelů</h2>
      <p>${hasExactUsage
        ? `Celkem ${escapeHtml(formatTokens(usage!.total.totalTokens))} tokenů v ${usage!.total.requestCount} generacích.`
        : 'Cursor zatím neposkytl přesná tokenová data. Cursor Office nic neodhaduje a nulu nevydává za skutečnou spotřebu.'}</p>
      <div class="usage-summary">
        ${renderUsageTotal('VSTUP', usage?.total.inputTokens)}
        ${renderUsageTotal('VÝSTUP', usage?.total.outputTokens)}
        ${renderUsageTotal('CACHE READ', usage?.total.cacheReadTokens)}
        ${renderUsageTotal('CACHE WRITE', usage?.total.cacheWriteTokens)}
      </div>
      <div class="usage-columns">
        ${renderUsageBuckets('REPOZITÁŘE / ADRESÁŘE', usage?.byWorkspace)}
        ${renderUsageBuckets('MODELY', usage?.byModel)}
        ${renderUsageBuckets('REPOZITÁŘ × MODEL', usage?.byWorkspaceModel)}
      </div>
      <div class="detail-note">Model pochází z oficiálního hook pole model/model_id. Tokeny se započítají jen tehdy, pokud je runtime skutečně předá; prompt ani odpověď se do ledgeru neukládají.</div>`;
    this.detailPanel.hidden = false;
    requireElement<HTMLButtonElement>(this.detailPanel, '.detail-close').addEventListener('click', () => {
      this.showUsageDetails = false;
      this.renderDetails();
    }, { once: true });
  }

  private updateSelectionVisuals(): void {
    this.ownerCard.classList.toggle('selected', this.selectedId === 'owner');
    this.agentList.querySelectorAll<HTMLElement>('[data-agent-id]').forEach(row => {
      row.classList.toggle('selected', row.dataset.agentId === this.selectedId);
    });
  }
}

function renderUsageTotal(label: string, value?: number): string {
  return `<span><small>${escapeHtml(label)}</small><strong>${escapeHtml(formatTokens(value ?? 0))}</strong></span>`;
}

function renderUsageBuckets(title: string, buckets?: UsageLedgerSnapshot['byWorkspace']): string {
  const rows = buckets?.length
    ? buckets.slice(0, 12).map(bucket => `<li title="${escapeHtml(bucket.key)}">
        <span>${escapeHtml(bucket.key)}</span>
        <strong>${escapeHtml(formatTokens(bucket.totalTokens))}</strong>
        <small>${bucket.requestCount} gen.</small>
      </li>`).join('')
    : '<li class="usage-empty">Nejsou k dispozici doložená data.</li>';
  return `<section class="usage-buckets"><h3>${escapeHtml(title)}</h3><ul>${rows}</ul></section>`;
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat('cs-CZ', {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1
  }).format(value);
}

function formatAgentModel(agent: AgentSnapshot, detailed = false): string {
  const isManager = agent.id.startsWith('cursor-window-manager-');
  if (isManager) {
    const models = agent.teamModels?.filter(Boolean) ?? [];
    if (models.length === 0) return detailed ? 'čeká na první model z Cursor hooku' : 'modely týmu čekají na hook';
    if (models.length <= 2) return models.join(' + ');
    return `${models.slice(0, 2).join(' + ')} + ${models.length - 2} další`;
  }
  return agent.model?.trim() || (detailed ? 'čeká na model z Cursor hooku' : 'model čeká na hook');
}

function formatAgentTokens(agent: AgentSnapshot): string {
  if (agent.usage) {
    const scope = agent.usageScope === 'workspace' ? ' / repo' : ' / generace';
    return `${formatTokens(agent.usage.totalTokens)} tok.${scope}`;
  }
  return agent.status === 'working' ? 'tokeny po dokončení' : 'tokeny Cursor neposlal';
}

function formatManagerCount(value: number): string {
  if (value === 1) return '1 manažer';
  if (value >= 2 && value <= 4) return `${value} manažeři`;
  return `${value} manažerů`;
}
