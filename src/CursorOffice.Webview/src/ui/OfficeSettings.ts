import type {
  Eyewear,
  FacialHair,
  HairStyle,
  OfficeLanguageSetting,
  OfficeSettingsSnapshot
} from '../contracts';
import { t } from '../i18n';
import { escapeHtml, requireElement } from './dom';

const hexPattern = /^#[0-9a-fA-F]{6}$/;
const hairStyles: HairStyle[] = [
  'executive',
  'sidePart',
  'short',
  'buzz',
  'bob',
  'long',
  'curly',
  'bun',
  'mohawk',
  'bald'
];
const facialHairStyles: FacialHair[] = [
  'none',
  'stubble',
  'mustache',
  'soulPatch',
  'goatee',
  'anchor',
  'fullBeard',
  'muttonChops',
  'sideburns'
];
const eyewearStyles: Eyewear[] = ['none', 'glasses', 'sunglasses'];
const languageSettings: OfficeLanguageSetting[] = ['auto', 'cs', 'en'];

const defaultSettings: OfficeSettingsSnapshot = {
  language: 'auto',
  ownerName: '',
  officeName: 'Cursor Office',
  officeLogoPath: '',
  roleColors: {
    owner: '#32c477',
    manager: '#00c7c7',
    chat: '#2f6bff',
    subagent: '#b084ff'
  },
  ownerAppearance: {
    hairStyle: 'executive',
    hairColor: '#3d281f',
    skinColor: '#e8b991',
    facialHair: 'none',
    eyewear: 'none'
  },
  showModel: true,
  showTokens: true,
  showActivity: true
};

export class OfficeSettings {
  private readonly panel: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private snapshot: OfficeSettingsSnapshot;

  public constructor(
    root: HTMLElement,
    toggle: HTMLButtonElement,
    private readonly postMessage?: (message: unknown) => void
  ) {
    this.toggle = toggle;
    this.snapshot = readEmbeddedSettings(root);
    this.panel = document.createElement('section');
    this.panel.className = 'settings-panel glass-card';
    this.panel.setAttribute('aria-label', t('settingsTitle'));
    this.panel.hidden = true;
    requireElement<HTMLElement>(root, '.office-shell').append(this.panel);
    this.render();
    this.toggle.addEventListener('click', () => this.toggleOpen());
  }

  public applySnapshot(snapshot: OfficeSettingsSnapshot): void {
    const changed = JSON.stringify(this.snapshot) !== JSON.stringify(snapshot);
    this.snapshot = snapshot;
    if (changed && !this.panel.hidden) {
      this.render();
    }
  }

  public close(): void {
    this.panel.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'false');
  }

  private toggleOpen(): void {
    this.panel.hidden = !this.panel.hidden;
    this.toggle.setAttribute('aria-expanded', this.panel.hidden ? 'false' : 'true');
    if (!this.panel.hidden) {
      this.render();
    }
  }

  private render(): void {
    const settings = this.snapshot;
    const logoLabel = settings.officeLogoPath.trim()
      ? fileBasename(settings.officeLogoPath)
      : t('settingsLogoEmpty');
    this.panel.innerHTML = `
      <button class="detail-close" type="button" aria-label="${t('closeSettings')}">×</button>
      <span class="detail-kicker">${t('settingsTitle')}</span>
      <h2>${t('settingsTitle')}</h2>
      <form class="settings-form">
        <label class="settings-field">
          <span>${t('settingsLanguage')}</span>
          <select name="language">${this.languageOptions(settings.language)}</select>
        </label>
        <label class="settings-field">
          <span>${t('settingsOfficeName')}</span>
          <input name="officeName" type="text" maxlength="80" value="${escapeHtml(settings.officeName)}" />
        </label>
        <div class="settings-field">
          <span>${t('settingsLogo')}</span>
          <div class="settings-logo-row">
            <button type="button" data-action="select-logo">${t('settingsSelectLogo')}</button>
            <button type="button" data-action="clear-logo" ${settings.officeLogoPath.trim() ? '' : 'disabled'}>${t('settingsClearLogo')}</button>
          </div>
          <small class="settings-path" title="${escapeHtml(settings.officeLogoPath)}">${escapeHtml(logoLabel)}</small>
        </div>
        <h3>${t('settingsOwner')}</h3>
        <label class="settings-field">
          <span>${t('settingsOwnerName')}</span>
          <input name="ownerName" type="text" maxlength="80" value="${escapeHtml(settings.ownerName)}" />
          <small>${t('settingsOwnerNameHint')}</small>
        </label>
        <h3>${t('settingsAppearance')}</h3>
        <div class="settings-grid">
          <label class="settings-field">
            <span>${t('settingsHairStyle')}</span>
            <select name="ownerAppearance.hairStyle">${this.hairOptions(settings.ownerAppearance.hairStyle)}</select>
          </label>
          ${this.colorField('ownerAppearance.hairColor', t('settingsHairColor'), settings.ownerAppearance.hairColor)}
          ${this.colorField('ownerAppearance.skinColor', t('settingsSkinColor'), settings.ownerAppearance.skinColor)}
          <label class="settings-field">
            <span>${t('settingsFacialHair')}</span>
            <select name="ownerAppearance.facialHair">${this.facialHairOptions(settings.ownerAppearance.facialHair)}</select>
          </label>
          <label class="settings-field">
            <span>${t('settingsEyewear')}</span>
            <select name="ownerAppearance.eyewear">${this.eyewearOptions(settings.ownerAppearance.eyewear)}</select>
          </label>
        </div>
        <h3>${t('settingsShirtColors')}</h3>
        <div class="settings-grid">
          ${this.colorField('shirtColors.owner', t('owner'), settings.roleColors.owner)}
          ${this.colorField('shirtColors.manager', t('manager'), settings.roleColors.manager)}
          ${this.colorField('shirtColors.chat', t('chatSenior'), settings.roleColors.chat)}
          ${this.colorField('shirtColors.subagent', t('subagent'), settings.roleColors.subagent)}
        </div>
        <h3>${t('settingsDisplay')}</h3>
        <label class="settings-check">
          <input name="hud.showModel" type="checkbox" ${settings.showModel ? 'checked' : ''} />
          <span>${t('settingsShowModel')}</span>
        </label>
        <label class="settings-check">
          <input name="hud.showTokens" type="checkbox" ${settings.showTokens ? 'checked' : ''} />
          <span>${t('settingsShowTokens')}</span>
        </label>
        <label class="settings-check">
          <input name="hud.showActivity" type="checkbox" ${settings.showActivity ? 'checked' : ''} />
          <span>${t('settingsShowActivity')}</span>
        </label>
      </form>`;
    this.bind();
  }

  private bind(): void {
    requireElement<HTMLButtonElement>(this.panel, '.detail-close').addEventListener('click', () => this.close());
    const form = requireElement<HTMLFormElement>(this.panel, '.settings-form');
    form.addEventListener('submit', event => event.preventDefault());
    form.addEventListener('change', event => this.onFieldChange(event.target));
    form.addEventListener('focusout', event => this.onTextCommit(event.target));
    form.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type === 'text') {
        event.preventDefault();
        this.onTextCommit(event.target);
      }
    });
    this.panel.querySelector('[data-action="select-logo"]')?.addEventListener('click', () => {
      this.postMessage?.({ type: 'office.settings.selectLogo' });
    });
    this.panel.querySelector('[data-action="clear-logo"]')?.addEventListener('click', () => {
      this.commit('officeLogoPath', '');
    });
  }

  private onFieldChange(target: EventTarget | null): void {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }
    const key = target.name;
    if (!key) {
      return;
    }
    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      this.commit(key, target.checked);
      return;
    }
    if (target instanceof HTMLInputElement && target.type === 'color') {
      this.commitHex(key, target.value, target);
      return;
    }
    if (target instanceof HTMLSelectElement) {
      this.commit(key, target.value);
    }
  }

  private onTextCommit(target: EventTarget | null): void {
    if (!(target instanceof HTMLInputElement) || (target.type !== 'text' && target.type !== 'color')) {
      return;
    }
    if (target.dataset.hex === 'true' || target.classList.contains('settings-hex')) {
      this.commitHex(target.name, target.value, target);
      return;
    }
    if (target.name === 'ownerName' || target.name === 'officeName') {
      this.commit(target.name, target.value);
    }
  }

  private commitHex(key: string, value: string, field: HTMLInputElement): void {
    const normalized = value.trim();
    if (!hexPattern.test(normalized)) {
      field.classList.add('settings-invalid');
      field.value = currentHex(this.snapshot, key);
      return;
    }
    field.classList.remove('settings-invalid');
    this.commit(key, normalized.toLowerCase());
  }

  private commit(key: string, value: string | boolean): void {
    if (key === 'hostPath') {
      return;
    }
    this.postMessage?.({
      type: 'office.settings.update',
      payload: { key, value }
    });
  }

  private languageOptions(selected: OfficeLanguageSetting): string {
    const labels: Record<OfficeLanguageSetting, string> = {
      auto: t('languageAuto'),
      cs: t('languageCs'),
      en: t('languageEn')
    };
    return languageSettings
      .map(value => `<option value="${value}"${value === selected ? ' selected' : ''}>${escapeHtml(labels[value])}</option>`)
      .join('');
  }

  private hairOptions(selected: HairStyle): string {
    const labels: Record<HairStyle, string> = {
      executive: t('hairExecutive'),
      sidePart: t('hairSidePart'),
      short: t('hairShort'),
      buzz: t('hairBuzz'),
      bob: t('hairBob'),
      long: t('hairLong'),
      curly: t('hairCurly'),
      bun: t('hairBun'),
      mohawk: t('hairMohawk'),
      bald: t('hairBald')
    };
    return hairStyles
      .map(value => `<option value="${value}"${value === selected ? ' selected' : ''}>${escapeHtml(labels[value])}</option>`)
      .join('');
  }

  private facialHairOptions(selected: FacialHair): string {
    const labels: Record<FacialHair, string> = {
      none: t('facialNone'),
      stubble: t('facialStubble'),
      mustache: t('facialMustache'),
      soulPatch: t('facialSoulPatch'),
      goatee: t('facialGoatee'),
      anchor: t('facialAnchor'),
      fullBeard: t('facialFullBeard'),
      muttonChops: t('facialMuttonChops'),
      sideburns: t('facialSideburns')
    };
    return facialHairStyles
      .map(value => `<option value="${value}"${value === selected ? ' selected' : ''}>${escapeHtml(labels[value])}</option>`)
      .join('');
  }

  private eyewearOptions(selected: Eyewear): string {
    const labels: Record<Eyewear, string> = {
      none: t('eyewearNone'),
      glasses: t('eyewearGlasses'),
      sunglasses: t('eyewearSunglasses')
    };
    return eyewearStyles
      .map(value => `<option value="${value}"${value === selected ? ' selected' : ''}>${escapeHtml(labels[value])}</option>`)
      .join('');
  }

  private colorField(name: string, label: string, value: string): string {
    const hex = hexPattern.test(value) ? value.toLowerCase() : '#000000';
    return `<label class="settings-field settings-color">
      <span>${escapeHtml(label)}</span>
      <span class="settings-color-inputs">
        <input name="${escapeHtml(name)}" type="color" value="${escapeHtml(hex)}" />
        <input class="settings-hex" name="${escapeHtml(name)}" type="text" spellcheck="false" maxlength="7" value="${escapeHtml(hex)}" />
      </span>
    </label>`;
  }
}

function readEmbeddedSettings(root: HTMLElement): OfficeSettingsSnapshot {
  const encoded = root.dataset.officeSettings;
  if (!encoded) {
    return defaultSettings;
  }
  try {
    return { ...defaultSettings, ...JSON.parse(decodeURIComponent(encoded)) as OfficeSettingsSnapshot };
  } catch {
    return defaultSettings;
  }
}

function currentHex(snapshot: OfficeSettingsSnapshot, key: string): string {
  switch (key) {
    case 'ownerAppearance.hairColor':
      return snapshot.ownerAppearance.hairColor;
    case 'ownerAppearance.skinColor':
      return snapshot.ownerAppearance.skinColor;
    case 'shirtColors.owner':
      return snapshot.roleColors.owner;
    case 'shirtColors.manager':
      return snapshot.roleColors.manager;
    case 'shirtColors.chat':
      return snapshot.roleColors.chat;
    case 'shirtColors.subagent':
      return snapshot.roleColors.subagent;
    default:
      return '#000000';
  }
}

function fileBasename(value: string): string {
  const trimmed = value.replace(/[\\/]+$/u, '');
  return trimmed.split(/[\\/]/u).filter(Boolean).at(-1) ?? trimmed;
}
