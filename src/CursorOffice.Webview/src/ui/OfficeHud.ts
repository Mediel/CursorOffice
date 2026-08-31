import type {
  AgentActivityEvent,
  AgentSnapshot,
  CursorWindowSnapshot,
  OfficeBootstrap,
  OfficeOwner,
  OfficePreferences,
  OfficeSettingsSnapshot,
  UsageLedgerSnapshot
} from '../contracts';
import { applyRoleColors, roleColors, statusColors, visualRoleFor } from '../contracts';
import { localeTag, statusLabel, t } from '../i18n';
import { colorToCss, escapeHtml, requireElement } from './dom';
import { OfficeSettings } from './OfficeSettings';

export type HudDisplayPreferences = {
  showModel: boolean;
  showTokens: boolean;
  showActivity: boolean;
};

const activityLimit = 140;

export class OfficeHud {
  public readonly canvas: HTMLCanvasElement;

  private readonly agentList: HTMLElement;
  private readonly ownerCard: HTMLElement;
  private readonly detailPanel: HTMLElement;
  private readonly windowFilter: HTMLSelectElement;
  private readonly brandInitials: HTMLElement;
  private readonly brandLogo: HTMLImageElement;
  private readonly brandName: HTMLElement;
  private readonly agentStates = new Map<string, AgentSnapshot>();
  private activityEvents: AgentActivityEvent[] = [];
  private ownerState: OfficeOwner | undefined;
  private usageState: UsageLedgerSnapshot | undefined;
  private selectedId: string | undefined;
  private showUsageDetails = false;
  private readonly display: HudDisplayPreferences;
  private readonly settings: OfficeSettings;

  public constructor(
    private readonly root: HTMLDivElement,
    private readonly onSelectionRequested: (id?: string) => void,
    private readonly onWindowFilterRequested: (windowId: string) => void,
    postMessage?: (message: unknown) => void
  ) {
    root.innerHTML = `
      <main class="office-shell">
        <canvas class="office-canvas" aria-label="${t('canvasAria')}"></canvas>
        <header class="office-topbar">
          <div class="brand-card glass-card">
            <span class="brand-mark">
              <span class="brand-initials">CO</span>
              <img class="brand-logo" alt="" hidden />
            </span>
            <span class="brand-copy">
              <strong class="brand-name">Cursor Office</strong>
              <span>${t('brandSubtitle')}</span>
            </span>
          </div>
          <div class="topbar-actions">
            <section class="metric-strip glass-card" aria-label="${t('officeSummaryAria')}">
              <span><strong data-metric="total">0</strong> ${t('agentsMetric')}</span>
              <span><strong data-metric="working">0</strong> ${t('workingMetric')}</span>
              <span><strong data-metric="attention">0</strong> ${t('waitingMetric')}</span>
              <button class="usage-metric" type="button" aria-label="${t('openUsageAria')}"><strong data-metric="usage">0</strong> ${t('tokensMetric')}</button>
            </section>
            <button class="settings-toggle glass-card" type="button" aria-label="${t('openSettingsAria')}" aria-expanded="false">
              <span aria-hidden="true">⚙</span>
            </button>
          </div>
        </header>

        <aside class="people-panel glass-card">
          <div class="panel-heading">
            <span>${t('team')}</span>
            <span class="live-badge"><i></i> LIVE</span>
          </div>
          <label class="window-filter-row">
            <span>${t('view')}</span>
            <select class="window-filter" aria-label="${t('filterWindowsAria')}">
              <option value="all">${t('allWindows')}</option>
            </select>
          </label>
          <section class="owner-card" aria-label="${t('ownerCardAria')}" role="button" tabindex="0"></section>
          <div class="panel-divider"></div>
          <section class="agent-list" aria-label="${t('agentListAria')}"></section>
        </aside>

        <footer class="office-footer glass-card">
          <span class="legend-group" aria-label="${t('roleLegendAria')}">
            <b class="legend-title">${t('roleLegendTitle')}</b>
            <span><i class="legend-dot role-dot" style="--legend-color: var(--role-owner)"></i>${t('owner')}</span>
            <span><i class="legend-dot role-dot" style="--legend-color: var(--role-manager)"></i>${t('manager')}</span>
            <span><i class="legend-dot role-dot" style="--legend-color: var(--role-chat)"></i>${t('chatSenior')}</span>
            <span><i class="legend-dot role-dot" style="--legend-color: var(--role-subagent)"></i>${t('subagent')}</span>
          </span>
          <span class="legend-separator" aria-hidden="true"></span>
          <span class="legend-group" aria-label="${t('statusLegendAria')}">
            <b class="legend-title">${t('statusLegendTitle')}</b>
            <span><i class="legend-dot status-dot" style="--legend-color: ${colorToCss(statusColors.unknown)}"></i>${t('statusUnknown')}</span>
            <span><i class="legend-dot status-dot" style="--legend-color: ${colorToCss(statusColors.idle)}"></i>${t('statusIdle')}</span>
            <span><i class="legend-dot status-dot" style="--legend-color: ${colorToCss(statusColors.working)}"></i>${t('statusWorking')}</span>
            <span><i class="legend-dot status-dot" style="--legend-color: ${colorToCss(statusColors.waitingForUser)}"></i>${t('statusWaiting')}</span>
            <span><i class="legend-dot status-dot" style="--legend-color: ${colorToCss(statusColors.error)}"></i>${t('statusError')}</span>
            <span><i class="legend-dot status-dot" style="--legend-color: ${colorToCss(statusColors.completed)}"></i>${t('statusCompleted')}</span>
            <span><i class="legend-dot status-dot" style="--legend-color: ${colorToCss(statusColors.offline)}"></i>${t('statusOffline')}</span>
          </span>
          <span class="footer-note">${t('footerControls')}</span>
        </footer>

        <section class="detail-panel glass-card" aria-live="polite" hidden></section>
      </main>`;

    this.display = readHudDisplayPreferences(root);
    this.canvas = requireElement<HTMLCanvasElement>(root, '.office-canvas');
    this.agentList = requireElement<HTMLElement>(root, '.agent-list');
    this.ownerCard = requireElement<HTMLElement>(root, '.owner-card');
    this.detailPanel = requireElement<HTMLElement>(root, '.detail-panel');
    this.windowFilter = requireElement<HTMLSelectElement>(root, '.window-filter');
    this.brandInitials = requireElement<HTMLElement>(root, '.brand-initials');
    this.brandLogo = requireElement<HTMLImageElement>(root, '.brand-logo');
    this.brandName = requireElement<HTMLElement>(root, '.brand-name');
    this.applyRoleColorStyles();
    this.settings = new OfficeSettings(root, requireElement<HTMLButtonElement>(root, '.settings-toggle'), postMessage);
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
    if (bootstrap.settings) {
      this.applyRolePalette(bootstrap.settings);
      this.applyDisplayPreferences(bootstrap.settings);
    }
    if (bootstrap.activity !== undefined) {
      this.activityEvents = bootstrap.activity;
    }
    this.updateBrand(bootstrap.brand);
    this.updateWindowFilter(bootstrap.windows, bootstrap.currentWindow, bootstrap.agents);
    this.updateOwner(bootstrap.owner);
    this.updateAgents(bootstrap.agents);
    this.updateUsage(bootstrap.usage);
  }

  public applyPreferences(settings: OfficeSettingsSnapshot): void {
    this.applyRolePalette(settings);
    this.applyDisplayPreferences(settings);
    this.updateAgents([...this.agentStates.values()]);
  }

  private applyRolePalette(settings: OfficeSettingsSnapshot): void {
    applyRoleColors(settings.roleColors);
    this.applyRoleColorStyles();
  }

  private applyRoleColorStyles(): void {
    this.root.style.setProperty('--role-owner', colorToCss(roleColors.owner));
    this.root.style.setProperty('--role-manager', colorToCss(roleColors.manager));
    this.root.style.setProperty('--role-chat', colorToCss(roleColors.chat));
    this.root.style.setProperty('--role-subagent', colorToCss(roleColors.subagent));
  }

  private applyDisplayPreferences(settings: OfficeSettingsSnapshot): void {
    this.display.showModel = settings.showModel !== false;
    this.display.showTokens = settings.showTokens !== false;
    this.display.showActivity = settings.showActivity !== false;
    this.writeDisplayPreferencesToDataset();
    this.settings.applySnapshot(settings);
  }

  private writeDisplayPreferencesToDataset(): void {
    let current: Record<string, unknown> = {};
    const encoded = this.root.dataset.officePreferences;
    if (encoded) {
      try {
        current = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;
      } catch {
        current = {};
      }
    }
    this.root.dataset.officePreferences = encodeURIComponent(JSON.stringify({
      ...current,
      showModel: this.display.showModel,
      showTokens: this.display.showTokens,
      showActivity: this.display.showActivity
    }));
  }

  private updateBrand(brand: OfficeBootstrap['brand']): void {
    const name = brand?.name.trim() || 'Cursor Office';
    this.brandName.textContent = name;
    this.brandInitials.textContent = officeInitials(name);
    const logo = brand?.logoDataUri;
    this.brandLogo.hidden = !logo;
    this.brandInitials.hidden = Boolean(logo);
    if (logo) {
      this.brandLogo.src = logo;
      this.brandLogo.alt = `${name} logo`;
    } else {
      this.brandLogo.removeAttribute('src');
      this.brandLogo.alt = '';
    }
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
          label: agent.windowLabel ?? t('cursorWindow', { id: agent.windowId.slice(-5) }),
          isCurrent: agent.windowId === currentWindow?.id,
          isFocused: false
        });
      }
    }
    const rows = [...options.entries()]
      .sort(([, left], [, right]) => {
        if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1;
        if (left.isFocused !== right.isFocused) return left.isFocused ? -1 : 1;
        return left.label.localeCompare(right.label, localeTag());
      })
      .map(([id, window]) => `<option value="${escapeHtml(id)}">${escapeHtml(`${window.label}${window.isCurrent ? ` · ${t('currentWindow')}` : window.isFocused ? ` · ${t('activeWindow')}` : ''}`)}</option>`);
    if (hasUnassigned) {
      rows.push(`<option value="unassigned">${t('unassignedConversations')}</option>`);
    }
    this.windowFilter.innerHTML = `<option value="all">${t('allWindows')}</option>${rows.join('')}`;
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
        <small>${t('ownerKicker')}</small>
        <strong>${escapeHtml(owner.displayName)}</strong>
        <span>${escapeHtml(owner.role)}</span>
      </span>
      <span class="owner-presence">${t('inOffice')}</span>`;

    if (this.selectedId === 'owner') {
      this.renderDetails();
    }
  }

  private updateAgents(agents: AgentSnapshot[]): void {
    this.agentStates.clear();
    agents.forEach(agent => this.agentStates.set(agent.id, agent));
    const orderedAgents = [...agents].sort((left, right) => {
      const workspace = (left.workspace ?? left.role).localeCompare(right.workspace ?? right.role, localeTag());
      if (workspace !== 0) return workspace;
      const leftKind = left.kind ?? 'primary';
      const rightKind = right.kind ?? 'primary';
      if (leftKind !== rightKind) return leftKind === 'subagent' ? 1 : -1;
      return left.displayName.localeCompare(right.displayName, localeTag());
    });

    const workspaceGroups = new Map<string, AgentSnapshot[]>();
    for (const agent of orderedAgents) {
      const workspace = agent.workspace?.trim() || t('unknownWorkspace');
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
            ?? (windowId === 'unassigned'
              ? t('unassignedConversations')
              : t('cursorWindow', { id: windowId.slice(-5) }));
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
                : childrenByParent.has(agent.id) ? 'S' : 'A';
            const activity = formatAgentActivity(agent);
            const model = formatAgentModel(agent);
            const tokens = formatAgentTokens(agent);
            const context = formatAgentContext(agent);
            const taskRow = this.display.showActivity
              ? `<span class="agent-task" title="${escapeHtml(activity)}">${escapeHtml(activity)}</span>`
              : '';
            const modelCell = this.display.showModel
              ? `<em class="agent-model" title="${escapeHtml(model)}">${escapeHtml(model)}</em>`
              : '';
            const tokenCell = this.display.showTokens
              ? `<small class="agent-tokens">${escapeHtml(tokens)}</small>`
              : '';
            const metaRow = modelCell || tokenCell
              ? `<span class="agent-meta">${modelCell}${tokenCell}</span>`
              : '';
            const contextRow = this.display.showTokens && context
              ? `<span class="agent-context" title="${escapeHtml(t('contextWindowHint'))}">${escapeHtml(context)}</span>`
              : '';
            return `<article class="agent-row${kindClass} role-${visualRole}${depthClass}${selectedClass}" data-agent-id="${escapeHtml(agent.id)}" role="button" tabindex="0" style="--agent-color: ${color}; --role-color: ${colorToCss(roleColors[visualRole])}">
          <span class="agent-avatar">${escapeHtml(avatar)}</span>
          <span class="agent-copy">
            <span class="agent-name-line">
              <strong>${escapeHtml(agent.displayName)}</strong>
              <small>${escapeHtml(statusLabel(agent.status))}</small>
            </span>
            ${taskRow}
            ${metaRow}
            ${contextRow}
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
            <span><small>${t('roomWorkspace')}</small><strong>${escapeHtml(workspace)}</strong></span>
            <em>${t('worksCount', { working, total: workspaceAgents.length })}</em>
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
        ? `${t('locallyRecorded', { count: usage.total.requestCount })}${workspace ? ` · ${t('mostIn', { workspace: workspace.key })}` : ''}${model ? ` · ${model.key}` : ''}`
        : t('exactTokensMissingHint');
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
        ? t('ownerUsageRecorded', {
          tokens: formatTokens(this.usageState.total.totalTokens),
          count: this.usageState.total.requestCount
        })
        : t('ownerUsageMissing');
      this.detailPanel.innerHTML = `
        <button class="detail-close" type="button" aria-label="${t('closeDetail')}">×</button>
        <span class="detail-kicker owner-kicker">${t('ownerOfficeKicker')}</span>
        <h2>${escapeHtml(this.ownerState.displayName)}</h2>
        <p>${escapeHtml(this.ownerState.role)}</p>
        <div class="detail-status"><i style="--detail-color: ${escapeHtml(this.ownerState.accent)}"></i> ${t('ownerPresent')}</div>
        <div class="detail-note">${escapeHtml(t('ownerDetailNote', { usage: recordedUsage }))}</div>`;
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
        ? t('hierarchyWindowManager')
        : isChatAgent
          ? [...this.agentStates.values()].some(candidate => candidate.parentAgentId === agent.id)
            ? t('hierarchyLeadAgent')
            : t('hierarchyWorkingAgent')
          : agent.kind === 'subagent' ? t('hierarchySubagent') : t('hierarchyUnassigned');
      const workspace = agent.workspace ?? agent.role;
      const workspaceLedgerKey = agent.workspacePath ?? agent.workspace;
      const workspaceUsage = this.usageState?.byWorkspace.find(bucket => bucket.key === workspaceLedgerKey);
      const activity = formatAgentActivity(agent);
      const modelValue = formatAgentModel(agent, true);
      const usageTitle = isWindowManager ? t('teamWorkspaceEvidence') : t('agentGenerationEvidence');
      const usageValue = formatInspectorUsage(agent, workspaceUsage);
      const contextValue = formatAgentContext(agent, true);
      const modelFact = this.display.showModel ? `
          <span><small>${isWindowManager ? t('teamModels') : t('model')}</small><strong title="${escapeHtml(modelValue)}">${escapeHtml(modelValue)}</strong></span>` : '';
      const usageFact = this.display.showTokens ? `
          <span><small>${escapeHtml(usageTitle)}</small><strong>${escapeHtml(usageValue)}</strong></span>` : '';
      const contextFact = this.display.showTokens && contextValue ? `
          <span><small>${t('contextWindow')}</small><strong title="${escapeHtml(t('contextWindowHint'))}">${escapeHtml(contextValue)}</strong></span>` : '';
      const workspaceUsageFact = isWindowManager || !this.display.showTokens ? '' : `
          <span><small>${t('workspaceRecorded')}</small><strong>${escapeHtml(workspaceUsage ? `${formatTokens(workspaceUsage.totalTokens)} ${tokenUnit()}` : t('waitingFirstGeneration'))}</strong></span>`;
      const conversationFact = agent.conversationTitle ? `
          <span><small>${t('chat')}</small><strong title="${escapeHtml(agent.conversationTitle)}">${escapeHtml(agent.conversationTitle)}</strong></span>` : '';
      const extraDetail = distinctActivityDetail(agent);
      const metadata = [
        extraDetail,
        agent.windowLabel ? `${t('cursorWindowLabel')}: ${agent.windowLabel}` : t('cursorWindowNotDetected'),
        agent.isParallelWorker ? t('parallelWorker') : undefined
      ].filter(Boolean).join(' · ');
      this.detailPanel.innerHTML = `
        <button class="detail-close" type="button" aria-label="${t('closeDetail')}">×</button>
        <span class="detail-kicker">${escapeHtml(`${workspace} · ${hierarchy}`)}</span>
        <h2>${escapeHtml(agent.displayName)}</h2>
        <p>${escapeHtml(this.display.showActivity ? activity : statusLabel(agent.status))}</p>
        <div class="detail-status"><i style="--detail-color: ${statusColor}"></i> ${escapeHtml(statusLabel(agent.status))}</div>
        <div class="detail-facts">
          ${conversationFact}
          ${modelFact}
          ${usageFact}
          ${contextFact}
          <span><small>${t('workspaceRepo')}</small><strong title="${escapeHtml(agent.workspacePath ?? workspace)}">${escapeHtml(workspace)}</strong></span>
          <span><small>${t('cursorWindowLabel')}</small><strong title="${escapeHtml(agent.windowId ?? t('notDetected'))}">${escapeHtml(agent.windowLabel ?? t('notDetected'))}</strong></span>
          ${workspaceUsageFact}
        </div>
        ${this.renderActivityTimeline(agent.id)}
        <div class="detail-note">${escapeHtml(metadata || t('positionNote'))}</div>`;
    }

    this.detailPanel.hidden = false;
    requireElement<HTMLButtonElement>(this.detailPanel, '.detail-close')
      .addEventListener('click', () => this.onSelectionRequested(), { once: true });
  }

  private renderActivityTimeline(agentId: string): string {
    if (!this.display.showActivity) {
      return '';
    }
    const events = this.activityEvents
      .filter(event => event.agentId === agentId)
      .slice()
      .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
    if (events.length === 0) {
      return `<div class="detail-timeline">
        <span class="detail-timeline-title">${t('activityTimeline')}</span>
        <p class="detail-timeline-empty">${t('activityTimelineEmpty')}</p>
      </div>`;
    }
    const rows = events.map(event => {
      const tool = event.tool?.trim();
      return `<li>
        <time>${escapeHtml(formatActivityTime(event.occurredAt))}</time>
        <span>${escapeHtml(activityKindLabel(event.kind))}${tool ? ` · ${escapeHtml(tool)}` : ''}</span>
        <small>${escapeHtml(statusLabel(event.status))}</small>
      </li>`;
    }).join('');
    return `<div class="detail-timeline">
      <span class="detail-timeline-title">${t('activityTimeline')}</span>
      <ol class="detail-timeline-list">${rows}</ol>
    </div>`;
  }

  private renderUsageDetails(): void {
    const usage = this.usageState;
    const hasExactUsage = Boolean(usage && usage.total.requestCount > 0);
    this.detailPanel.classList.add('usage-details');
    this.detailPanel.innerHTML = `
      <button class="detail-close" type="button" aria-label="${t('closeUsage')}">×</button>
      <span class="detail-kicker">${t('ledgerKicker')}</span>
      <h2>${t('modelUsage')}</h2>
      <p>${hasExactUsage
        ? t('usageTotal', { tokens: formatTokens(usage!.total.totalTokens), count: usage!.total.requestCount })
        : t('usageMissing')}</p>
      <div class="usage-summary">
        ${renderUsageTotal(t('input'), usage?.total.inputTokens)}
        ${renderUsageTotal(t('output'), usage?.total.outputTokens)}
        ${renderUsageTotal(t('cacheRead'), usage?.total.cacheReadTokens)}
        ${renderUsageTotal(t('cacheWrite'), usage?.total.cacheWriteTokens)}
      </div>
      <div class="usage-columns">
        ${renderUsageBuckets(t('repositories'), usage?.byWorkspace)}
        ${renderUsageBuckets(t('models'), usage?.byModel)}
        ${renderUsageBuckets(t('repositoryModel'), usage?.byWorkspaceModel)}
      </div>
      <div class="detail-note">${t('ledgerNote')}</div>`;
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

function officeInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  if (words.length === 0) {
    return 'CO';
  }
  return words
    .slice(0, 2)
    .map(word => Array.from(word)[0] ?? '')
    .join('')
    .toLocaleUpperCase();
}

function renderUsageTotal(label: string, value?: number): string {
  return `<span><small>${escapeHtml(label)}</small><strong>${escapeHtml(formatTokens(value ?? 0))}</strong></span>`;
}

function renderUsageBuckets(title: string, buckets?: UsageLedgerSnapshot['byWorkspace']): string {
  const rows = buckets?.length
    ? buckets.slice(0, 12).map(bucket => `<li title="${escapeHtml(bucket.key)}">
        <span>${escapeHtml(bucket.key)}</span>
        <strong>${escapeHtml(formatTokens(bucket.totalTokens))}</strong>
        <small>${bucket.requestCount} ${t('generationAbbr')}</small>
      </li>`).join('')
    : `<li class="usage-empty">${t('noEvidenceData')}</li>`;
  return `<section class="usage-buckets"><h3>${escapeHtml(title)}</h3><ul>${rows}</ul></section>`;
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat(localeTag(), {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1
  }).format(value);
}

export function readHudDisplayPreferences(root?: HTMLElement | null): HudDisplayPreferences {
  const defaults: HudDisplayPreferences = { showModel: true, showTokens: true, showActivity: true };
  const encoded = (root ?? document.getElementById('app'))?.dataset.officePreferences;
  if (!encoded) {
    return defaults;
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(encoded)) as OfficePreferences;
    return {
      showModel: parsed.showModel !== false,
      showTokens: parsed.showTokens !== false,
      showActivity: parsed.showActivity !== false
    };
  } catch {
    return defaults;
  }
}

function isWindowManager(agent: AgentSnapshot): boolean {
  return agent.id.startsWith('cursor-window-manager-');
}

export function formatAgentModel(agent: AgentSnapshot, detailed = false): string {
  if (isWindowManager(agent)) {
    const models = agent.teamModels?.filter(Boolean) ?? [];
    if (models.length === 0) return detailed ? t('teamModelsWaitingLong') : t('teamModelsWaitingShort');
    if (models.length <= 2) {
      return appendModelParams(models.join(' + '), agent, detailed);
    }
    return appendModelParams(
      `${models.slice(0, 2).join(' + ')} + ${t('moreModels', { count: models.length - 2 })}`,
      agent,
      detailed
    );
  }
  const model = agent.model?.trim();
  if (!model) {
    return detailed ? t('modelWaitingLong') : t('modelWaitingShort');
  }
  return appendModelParams(model, agent, detailed);
}

function appendModelParams(model: string, agent: AgentSnapshot, detailed: boolean): string {
  if (!detailed || isWindowManager(agent)) {
    return model;
  }
  const params = [
    agent.modelParams?.thinking ? `${t('modelThinking')} ${agent.modelParams.thinking}` : undefined,
    agent.modelParams?.effort ? `${t('modelEffort')} ${agent.modelParams.effort}` : undefined,
    agent.modelParams?.context ? `${t('modelContextKnob')} ${agent.modelParams.context}` : undefined
  ].filter(Boolean);
  return params.length > 0 ? `${model} · ${params.join(' · ')}` : model;
}

export function formatAgentTokens(agent: AgentSnapshot): string {
  if (isWindowManager(agent)) {
    if (agent.usage) {
      return `${formatTokens(agent.usage.totalTokens)} tok. / ${t('repositoryScope')}`;
    }
    return t('workspaceLedgerWaitingShort');
  }
  if (agent.usage) {
    return `${formatTokens(agent.usage.totalTokens)} tok. / ${t('generationScope')}`;
  }
  return agent.status === 'working' ? t('tokensAfterCompletion') : t('tokensNotSent');
}

function formatInspectorUsage(
  agent: AgentSnapshot,
  workspaceUsage?: UsageLedgerSnapshot['byWorkspace'][number]
): string {
  if (isWindowManager(agent)) {
    const evidenced = agent.usage ?? workspaceUsage;
    return evidenced
      ? `${formatTokens(evidenced.totalTokens)} ${tokenUnit()}`
      : t('workspaceLedgerWaitingLong');
  }
  if (agent.usage) {
    return `${formatTokens(agent.usage.totalTokens)} ${tokenUnit()}`;
  }
  return agent.status === 'working' ? t('afterGeneration') : t('cursorDidNotSend');
}

export function formatAgentContext(agent: AgentSnapshot, detailed = false): string | undefined {
  const usage = agent.contextUsage;
  if (!usage) {
    return undefined;
  }
  const parts: string[] = [];
  if (usage.contextUsagePercent != null) {
    parts.push(formatPercent(usage.contextUsagePercent));
  }
  if (usage.contextTokens != null && usage.contextWindowSize != null) {
    parts.push(`${formatTokens(usage.contextTokens)}/${formatTokens(usage.contextWindowSize)}`);
  } else if (usage.contextTokens != null) {
    parts.push(formatTokens(usage.contextTokens));
  } else if (usage.contextWindowSize != null) {
    parts.push(formatTokens(usage.contextWindowSize));
  }
  if (parts.length === 0) {
    return undefined;
  }
  const value = parts.join(' · ');
  return detailed ? value : `${t('contextWindowShort')} ${value}`;
}

export function formatAgentActivity(agent: AgentSnapshot): string {
  const raw = agent.currentTask?.trim() || agent.detail?.trim();
  if (!raw) {
    return t('noCurrentTask');
  }
  return limitActivity(sanitizeActivityText(raw), activityLimit);
}

function distinctActivityDetail(agent: AgentSnapshot): string | undefined {
  const detail = agent.detail?.trim();
  const task = agent.currentTask?.trim();
  if (!detail || detail === task) {
    return undefined;
  }
  return limitActivity(sanitizeActivityText(detail), activityLimit);
}

function sanitizeActivityText(value: string): string {
  return value.replace(/(?:[A-Za-z]:)?(?:[\\/][^\\/:*?"<>|\n]+)+/gu, match => fileBasename(match));
}

function fileBasename(value: string): string {
  const trimmed = value.replace(/[\\/]+$/u, '');
  return trimmed.split(/[\\/]/u).filter(Boolean).at(-1) ?? trimmed;
}

function limitActivity(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) {
    return value;
  }
  let prefix = value.slice(0, maximumLength - 1).trimEnd();
  const wordBoundary = prefix.lastIndexOf(' ');
  if (wordBoundary >= maximumLength / 2) {
    prefix = prefix.slice(0, wordBoundary);
  }
  return `${prefix}…`;
}

function tokenUnit(): string {
  return t('tokensMetric').replace('*', '').trim();
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat(localeTag(), { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatActivityTime(occurredAt: string): string {
  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) {
    return occurredAt;
  }
  return new Intl.DateTimeFormat(localeTag(), {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function activityKindLabel(kind: string): string {
  switch (kind) {
    case 'userPrompt': return t('activityKindUserPrompt');
    case 'agentResponse': return t('activityKindAgentResponse');
    case 'delegationStarted': return t('activityKindDelegationStarted');
    case 'handoffCompleted': return t('activityKindHandoffCompleted');
    case 'tool': return t('activityKindTool');
    case 'status': return t('activityKindStatus');
    default: return kind;
  }
}

function formatManagerCount(value: number): string {
  if (value === 1) return t('managerOne');
  if (value >= 2 && value <= 4) return t('managerFew', { count: value });
  return t('managerMany', { count: value });
}
