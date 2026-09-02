import './styles.css';
import { applyRoleColors, type HostMessage, type OfficeBootstrap, type OfficePreferences, type OfficeSettingsSnapshot } from './contracts';
import { setLanguage } from './i18n';
import { projectWindowTeams } from './teamProjection';
import { requireElement } from './ui/dom';
import { OfficeHud } from './ui/OfficeHud';
import { OfficeWorld, type OfficeWorldPersistedState } from './world/OfficeWorld';

const root = requireElement<HTMLDivElement>(document, '#app');
const preferences = readEmbeddedPreferences(root);
setLanguage(preferences.language);
applyRoleColors(preferences.roleColors);
const vscodeApi = typeof acquireVsCodeApi === 'function'
  ? acquireVsCodeApi<OfficeWorldPersistedState>()
  : undefined;
let hud!: OfficeHud;
let world!: OfficeWorld;
let latestBootstrap: OfficeBootstrap | undefined;
let selectedWindowId = 'all';
const demoParameters = new URLSearchParams(window.location.search);
const workDemo = !vscodeApi && demoParameters.has('workDemo');
const kitchenDemo = !vscodeApi && demoParameters.has('kitchenDemo');
const couchDemo = !vscodeApi && demoParameters.has('couchDemo');
const ownerDemo = !vscodeApi && demoParameters.has('ownerDemo');
const attentionDemo = !vscodeApi && demoParameters.has('attentionDemo');
const requestedGroupDemo = !vscodeApi ? demoParameters.get('groupDemo') : null;
const groupDemo = requestedGroupDemo === 'sofa'
  || requestedGroupDemo === 'meeting'
  || requestedGroupDemo === 'standing'
  ? requestedGroupDemo
  : undefined;
const actorRegressionDemo = !vscodeApi && [
  'workDemo',
  'kitchenDemo',
  'couchDemo',
  'ownerDemo',
  'attentionDemo',
  'groupDemo',
  'crowdDemo',
  'retirementDemo'
].some(parameter => demoParameters.has(parameter));
const standaloneCameraState: OfficeWorldPersistedState = workDemo
  ? {
    cameraPosition: [2.8, 4.1, -0.55],
    cameraTarget: [7.55, 0.85, -4.3]
  }
  : kitchenDemo
    ? {
      cameraPosition: [-1.25, 4.25, 3.15],
      cameraTarget: [-8.15, 0.86, 1.35]
    }
    : couchDemo
      ? {
        cameraPosition: [-6.15, 4.25, 0.3],
        cameraTarget: [-2.25, 0.78, 4.72]
      }
    : {};

function readEmbeddedPreferences(element: HTMLElement): OfficePreferences {
  const encoded = element.dataset.officePreferences;
  if (encoded) {
    try {
      return JSON.parse(decodeURIComponent(encoded)) as OfficePreferences;
    } catch {
      // Invalid embedded settings fall back to a safe English presentation.
    }
  }
  return {
    language: 'en',
    roleColors: {
      owner: '#32c477',
      manager: '#00c7c7',
      chat: '#2f6bff',
      subagent: '#b084ff'
    }
  };
}

function select(id?: string): void {
  world.select(id);
  hud.select(id);
}

hud = new OfficeHud(root, select, windowId => {
  selectedWindowId = windowId;
  renderBootstrap();
}, message => vscodeApi?.postMessage(message));
world = new OfficeWorld(
  hud.canvas,
  select,
  vscodeApi?.getState() ?? standaloneCameraState,
  state => vscodeApi?.setState(state)
);

function applyBootstrap(bootstrap: OfficeBootstrap): void {
  latestBootstrap = bootstrap;
  renderBootstrap();
}

function renderBootstrap(): void {
  if (!latestBootstrap) {
    return;
  }
  const projectedAgents = actorRegressionDemo
    ? latestBootstrap.agents
    : projectWindowTeams(latestBootstrap);
  const allAgents = labelTeamMembers(projectedAgents);
  const agents = selectedWindowId === 'all'
    ? allAgents
    : selectedWindowId === 'unassigned'
      ? allAgents.filter(agent => !agent.windowId)
      : allAgents.filter(agent => agent.windowId === selectedWindowId);
  const projection = {
    ...latestBootstrap,
    agents,
    restoreTeam: latestBootstrap.restoreTeam,
    activity: latestBootstrap.activity
  };
  hud.applyBootstrap(projection);
  world.applyBootstrap({
    ...latestBootstrap,
    agents: allAgents,
    restoreTeam: latestBootstrap.restoreTeam,
    activity: latestBootstrap.activity
  });
  world.setWindowFilter(selectedWindowId);
}

function labelTeamMembers(agents: OfficeBootstrap['agents']): OfficeBootstrap['agents'] {
  const groupCounts = new Map<string, number>();
  for (const agent of agents) {
    if (agent.kind === 'subagent') {
      continue;
    }
    const key = agent.windowId ?? agent.workspacePath ?? agent.workspace ?? agent.id;
    groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
  }
  const managerLabels = new Map<string, string>();
  const managersDecorated = agents.map(agent => {
    if (agent.kind === 'subagent') {
      return agent;
    }
    const workspace = agent.workspace?.trim() || 'Cursor';
    const key = agent.windowId ?? agent.workspacePath ?? agent.workspace ?? agent.id;
    const suffix = (groupCounts.get(key) ?? 0) > 1
      ? ` · ${agent.id.replace(/^cursor-/i, '').slice(0, 6)}`
      : '';
    const displayName = agent.displayName.startsWith('Manager ')
      ? agent.displayName
      : `Manager ${workspace}${suffix}`;
    managerLabels.set(agent.id, displayName);
    return { ...agent, displayName };
  });
  const agentsById = new Map(managersDecorated.map(agent => [agent.id, agent]));
  const parentContext = (agent: OfficeBootstrap['agents'][number], visited = new Set<string>()): string => {
    if (!agent.parentAgentId || visited.has(agent.id)) {
      return agent.workspace?.trim() || 'Unassigned chat';
    }
    visited.add(agent.id);
    const parent = agentsById.get(agent.parentAgentId);
    if (!parent) {
      return agent.workspace?.trim() || 'Unassigned chat';
    }
    if (parent.kind !== 'subagent') {
      return (managerLabels.get(parent.id) ?? parent.displayName).replace(/^Manager\s+/u, '').trim();
    }
    return `${parentContext(parent, visited)} · ${parent.displayName.trim()}`;
  };
  return managersDecorated.map(agent => {
    if (agent.kind !== 'subagent') {
      return agent;
    }
    const conversationContext = parentContext(agent);
    const ownIdentity = agent.displayName.trim() || 'Subagent';
    return {
      ...agent,
      displayName: `${conversationContext} · ${ownIdentity}`
    };
  });
}

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  if (event.data.type === 'office.bootstrap' && event.data.payload) {
    applyBootstrap(event.data.payload as OfficeBootstrap);
    return;
  }
  if (event.data.type === 'office.preferences' && event.data.payload) {
    const settings = event.data.payload as OfficeSettingsSnapshot;
    if (!latestBootstrap) {
      hud.applyPreferences(settings);
      return;
    }
    latestBootstrap = {
      ...latestBootstrap,
      settings: { ...latestBootstrap.settings, ...settings }
    };
    renderBootstrap();
  }
});

window.addEventListener('beforeunload', () => world.dispose(), { once: true });
world.start();

if (vscodeApi) {
  vscodeApi.postMessage({ type: 'webview.ready' });
} else {
  const demoBootstrap: OfficeBootstrap = {
    owner: {
      displayName: 'Owner',
      role: 'Office owner',
      accent: '#f4b85c'
    },
    currentWindow: {
      id: 'demo-window-cursor-office',
      label: 'CursorOffice · DEMO1',
      workspaceRoots: ['C:\\source\\CursorOffice'],
      isFocused: true,
      lastFocusedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isCurrent: true
    },
    windows: [
      {
        id: 'demo-window-cursor-office',
        label: 'CursorOffice · DEMO1',
        workspaceRoots: ['C:\\source\\CursorOffice'],
        isFocused: true,
        lastFocusedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isCurrent: true
      },
      {
        id: 'demo-window-shop',
        label: 'Shop · DEMO2',
        workspaceRoots: ['C:\\source\\Shop'],
        isFocused: false,
        lastFocusedAt: new Date(Date.now() - 12_000).toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    agents: [
      {
        id: 'alice',
        displayName: 'Alice',
        role: 'Developer',
        status: 'working',
        currentTask: 'Preparing the extension host',
        workspace: 'CursorOffice',
        windowId: 'demo-window-cursor-office',
        windowLabel: 'CursorOffice · DEMO1',
        windowCorrelation: 'focused',
        model: 'composer-2.5',
        kind: 'primary',
        generationId: 'demo-owner-chat-1',
        conversationTitle: 'Terminal integration details',
        interactionKind: 'userPrompt',
        usage: { inputTokens: 12_000, outputTokens: 1_400, cacheReadTokens: 4_200, cacheWriteTokens: 0, totalTokens: 17_600 }
      },
      {
        id: 'bob',
        displayName: 'General Purpose b0b123',
        role: 'CursorOffice · General Purpose',
        status: 'waitingForUser',
        currentTask: 'Analyzing the sign-in flow and service dependencies',
        workspace: 'CursorOffice',
        windowId: 'demo-window-cursor-office',
        windowLabel: 'CursorOffice · DEMO1',
        windowCorrelation: 'conversation',
        model: 'claude-sonnet-5',
        kind: 'subagent',
        parentAgentId: 'alice',
        generationId: 'demo-delegation-1',
        interactionKind: 'delegationStarted'
      },
      {
        id: 'ema',
        displayName: 'Ema',
        role: 'Test Engineer',
        status: 'completed',
        currentTask: 'Verified the domain model',
        workspace: 'CursorOffice',
        windowId: 'demo-window-cursor-office',
        windowLabel: 'CursorOffice · DEMO1'
      },
      {
        id: 'dan',
        displayName: 'Dan',
        role: 'Backend Developer',
        status: 'working',
        currentTask: 'Implementing the local bridge',
        workspace: 'Shop',
        windowId: 'demo-window-shop',
        windowLabel: 'Shop · DEMO2',
        model: 'cursor-grok-4.6',
        conversationTitle: 'Checkout runtime verification'
      },
      {
        id: 'klara',
        displayName: 'Clara',
        role: 'Product Owner',
        status: 'waitingForUser',
        currentTask: 'Waiting for proposal approval',
        workspace: 'Shop',
        windowId: 'demo-window-shop',
        windowLabel: 'Shop · DEMO2'
      },
      {
        id: 'milan',
        displayName: 'Milan',
        role: 'Debugger',
        status: 'error',
        currentTask: 'Investigating an integration error',
        workspace: 'Shop',
        windowId: 'demo-window-shop',
        windowLabel: 'Shop · DEMO2'
      },
      {
        id: 'nina',
        displayName: 'Nina',
        role: 'Analyst',
        status: 'idle',
        currentTask: 'Ready for the next assignment',
        workspace: 'Shop',
        windowId: 'demo-window-shop',
        windowLabel: 'Shop · DEMO2'
      },
      {
        id: 'ota',
        displayName: 'Ota',
        role: 'Developer',
        status: 'working',
        currentTask: 'Checking a multi-agent run',
        workspace: 'Shop',
        windowId: 'demo-window-shop',
        windowLabel: 'Shop · DEMO2',
        model: 'composer-2.5'
      },
      {
        id: 'pavel',
        displayName: 'Pavel',
        role: 'Reviewer',
        status: 'completed',
        currentTask: 'Completed the change review',
        workspace: 'CursorOffice',
        windowId: 'demo-window-cursor-office',
        windowLabel: 'CursorOffice · DEMO1'
      },
      {
        id: 'sara',
        displayName: 'Sara',
        role: 'Researcher',
        status: 'waitingForUser',
        currentTask: 'Waiting for more context',
        workspace: 'CursorOffice',
        windowId: 'demo-window-cursor-office',
        windowLabel: 'CursorOffice · DEMO1'
      }
    ],
    usage: {
      total: { key: 'Total', inputTokens: 200_000, outputTokens: 18_000, cacheReadTokens: 90_000, cacheWriteTokens: 4_000, totalTokens: 312_000, requestCount: 14 },
      byWorkspace: [{ key: 'CursorOffice', inputTokens: 100_000, outputTokens: 9_000, cacheReadTokens: 50_000, cacheWriteTokens: 1_000, totalTokens: 160_000, requestCount: 7 }],
      byModel: [{ key: 'composer-2.5', inputTokens: 150_000, outputTokens: 12_000, cacheReadTokens: 70_000, cacheWriteTokens: 2_000, totalTokens: 234_000, requestCount: 9 }],
      byWorkspaceModel: [],
      byDay: []
    }
  };
  const socialDemo = demoParameters.has('socialDemo');
  const crowdDemo = demoParameters.has('crowdDemo');
  const cameraDemo = demoParameters.has('cameraDemo');
  const retirementDemo = demoParameters.has('retirementDemo');
  applyBootstrap(workDemo
    ? {
      ...demoBootstrap,
      agents: demoBootstrap.agents
        .filter(agent => agent.id === 'alice')
        .map(agent => ({ ...agent, interactionKind: undefined, generationId: undefined }))
    }
    : kitchenDemo
      ? {
        ...demoBootstrap,
        agents: demoBootstrap.agents.filter(agent => agent.id === 'nina')
      }
    : couchDemo
      ? {
        ...demoBootstrap,
        agents: demoBootstrap.agents.filter(agent => agent.id === 'nina')
      }
    : ownerDemo
      ? {
        ...demoBootstrap,
        agents: demoBootstrap.agents
          .filter(agent => agent.id === 'nina')
          .map(agent => ({
            ...agent,
            status: 'idle' as const,
            interactionKind: undefined,
            generationId: undefined
          }))
      }
    : attentionDemo
      ? {
        ...demoBootstrap,
        agents: demoBootstrap.agents
          .filter(agent => agent.id === 'bob')
          .map(agent => ({ ...agent, interactionKind: undefined, generationId: undefined }))
      }
    : retirementDemo
    ? {
      ...demoBootstrap,
      agents: demoBootstrap.agents
        .filter(agent => agent.id === 'bob')
        .map(agent => ({
          ...agent,
          status: 'completed' as const,
          currentTask: 'Handed off the result and is preparing to leave',
          interactionKind: 'handoffCompleted' as const
        }))
    }
    : groupDemo
      ? {
        ...demoBootstrap,
        agents: demoBootstrap.agents
          .filter(agent => ['alice', 'bob', 'dan', 'nina'].includes(agent.id))
          .map(agent => ({
            ...agent,
            status: 'idle' as const,
            interactionKind: undefined,
            generationId: undefined
          }))
      }
    : socialDemo
    ? {
      ...demoBootstrap,
      agents: demoBootstrap.agents.filter(agent => agent.id === 'alice' || agent.id === 'bob')
    }
    : crowdDemo
      ? {
        ...demoBootstrap,
        agents: demoBootstrap.agents
          .filter(agent => agent.id === 'alice' || agent.id === 'dan')
          .map(agent => ({ ...agent, interactionKind: undefined, generationId: undefined }))
      }
    : demoBootstrap);
  if (kitchenDemo) {
    window.setTimeout(() => world.startKitchenDemo(), 100);
    window.setInterval(() => {
      root.dataset.kitchenDemo = JSON.stringify(world.getKitchenDemoState());
    }, 100);
  }
  if (couchDemo) {
    window.setTimeout(() => world.startCouchDemo(), 100);
    window.setInterval(() => {
      root.dataset.couchDemo = JSON.stringify(world.getCouchDemoState());
    }, 100);
  }
  if (ownerDemo) {
    window.setTimeout(() => {
      world.startOwnerDemo();
      select('owner');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
      window.setTimeout(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
      }, 1_600);
    }, 100);
    window.setInterval(() => {
      root.dataset.ownerDemo = JSON.stringify(world.getOwnerDemoState());
    }, 100);
  }
  if (attentionDemo) {
    window.setInterval(() => {
      root.dataset.attentionDemo = JSON.stringify(world.getAttentionDemoState());
    }, 100);
  }
  if (crowdDemo) {
    window.setTimeout(() => world.startCrowdDemo(), 100);
    window.setInterval(() => {
      root.dataset.crowdDemo = JSON.stringify(world.getCrowdDemoState());
    }, 250);
  }
  if (retirementDemo) {
    window.setTimeout(() => world.startRetirementDemo(), 100);
    window.setInterval(() => {
      root.dataset.retirementDemo = JSON.stringify(world.getRetirementDemoState());
    }, 100);
  }
  if (groupDemo) {
    window.setTimeout(() => world.startGroupDemo(groupDemo), 100);
    window.setInterval(() => {
      root.dataset.groupDemo = JSON.stringify(world.getGroupDemoState());
    }, 100);
  }
  if (cameraDemo) {
    window.setInterval(() => {
      root.dataset.cameraDemo = JSON.stringify(world.getCameraDemoState());
    }, 100);
  }
}
