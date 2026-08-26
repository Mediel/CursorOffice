import * as vscode from 'vscode';

export type OfficeLanguage = 'cs' | 'en';
export type OfficeLanguageSetting = 'auto' | OfficeLanguage;
export type OfficeRoleColors = {
  owner: string;
  manager: string;
  chat: string;
  subagent: string;
};

export type OwnerAppearancePreferences = {
  hairStyle: 'bald' | 'buzz' | 'short' | 'sidePart' | 'executive' | 'bob' | 'long' | 'curly' | 'bun' | 'mohawk';
  hairColor: string;
  skinColor: string;
  facialHair: 'none' | 'stubble' | 'mustache' | 'soulPatch' | 'goatee' | 'anchor' | 'fullBeard' | 'muttonChops' | 'sideburns';
  eyewear: 'none' | 'glasses' | 'sunglasses';
};

export type OfficePreferences = {
  language: OfficeLanguage;
  roleColors: OfficeRoleColors;
  ownerAppearance: OwnerAppearancePreferences;
  showModel: boolean;
  showTokens: boolean;
  showActivity: boolean;
};

export type OfficeSettingsSnapshot = {
  language: OfficeLanguageSetting;
  ownerName: string;
  officeName: string;
  officeLogoPath: string;
  roleColors: OfficeRoleColors;
  ownerAppearance: OwnerAppearancePreferences;
  showModel: boolean;
  showTokens: boolean;
  showActivity: boolean;
};

export const languageSettings = ['auto', 'cs', 'en'] as const;
export const hairStyles = [
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
] as const;
export const facialHairStyles = [
  'none',
  'stubble',
  'mustache',
  'soulPatch',
  'goatee',
  'anchor',
  'fullBeard',
  'muttonChops',
  'sideburns'
] as const;
export const eyewearStyles = ['none', 'glasses', 'sunglasses'] as const;

const applicationSettingKeys = new Set([
  'language',
  'officeName',
  'officeLogoPath',
  'ownerAppearance.hairStyle',
  'ownerAppearance.hairColor',
  'ownerAppearance.skinColor',
  'ownerAppearance.facialHair',
  'ownerAppearance.eyewear',
  'shirtColors.owner',
  'shirtColors.manager',
  'shirtColors.chat',
  'shirtColors.subagent',
  'hud.showModel',
  'hud.showTokens',
  'hud.showActivity'
]);

export const defaultRoleColors: OfficeRoleColors = {
  owner: '#32c477',
  manager: '#00c7c7',
  chat: '#2f6bff',
  subagent: '#b084ff'
};

export function readOfficePreferences(): OfficePreferences {
  const configuration = vscode.workspace.getConfiguration('cursorOffice');
  const languageSetting = configuration.get<string>('language', 'auto');
  return {
    language: resolveLanguage(languageSetting),
    roleColors: {
      owner: readHexColor(configuration, 'shirtColors.owner', defaultRoleColors.owner),
      manager: readHexColor(configuration, 'shirtColors.manager', defaultRoleColors.manager),
      chat: readHexColor(configuration, 'shirtColors.chat', defaultRoleColors.chat),
      subagent: readHexColor(configuration, 'shirtColors.subagent', defaultRoleColors.subagent)
    },
    ownerAppearance: {
      hairStyle: readChoice(configuration, 'ownerAppearance.hairStyle', hairStyles, 'executive'),
      hairColor: readHexColor(configuration, 'ownerAppearance.hairColor', '#3d281f'),
      skinColor: readHexColor(configuration, 'ownerAppearance.skinColor', '#e8b991'),
      facialHair: readChoice(configuration, 'ownerAppearance.facialHair', facialHairStyles, 'none'),
      eyewear: readChoice(configuration, 'ownerAppearance.eyewear', eyewearStyles, 'none')
    },
    showModel: readBoolean(configuration, 'hud.showModel', true),
    showTokens: readBoolean(configuration, 'hud.showTokens', true),
    showActivity: readBoolean(configuration, 'hud.showActivity', true)
  };
}

export function readOfficeSettingsSnapshot(): OfficeSettingsSnapshot {
  const configuration = vscode.workspace.getConfiguration('cursorOffice');
  const preferences = readOfficePreferences();
  return {
    language: readChoice(configuration, 'language', languageSettings, 'auto'),
    ownerName: readString(configuration, 'ownerName', ''),
    officeName: readString(configuration, 'officeName', 'Cursor Office'),
    officeLogoPath: readString(configuration, 'officeLogoPath', ''),
    roleColors: preferences.roleColors,
    ownerAppearance: preferences.ownerAppearance,
    showModel: preferences.showModel,
    showTokens: preferences.showTokens,
    showActivity: preferences.showActivity
  };
}

export async function applyOfficeSettingUpdate(key: string, value: unknown): Promise<boolean> {
  if (key === 'hostPath' || key.length === 0) {
    return false;
  }

  const configuration = vscode.workspace.getConfiguration('cursorOffice');
  try {
    if (key === 'ownerName') {
      if (typeof value !== 'string') {
        return false;
      }
      await updateSetting(configuration, 'ownerName', value, vscode.ConfigurationTarget.Workspace);
      return true;
    }

    if (!applicationSettingKeys.has(key)) {
      return false;
    }

    const validated = validateSettingValue(key, value);
    if (validated === undefined) {
      return false;
    }

    await updateSetting(configuration, key, validated, vscode.ConfigurationTarget.Global);
    return true;
  } catch {
    return false;
  }
}

export function ownerRoleFor(language: OfficeLanguage): string {
  return language === 'cs' ? 'Majitel kanceláře' : 'Office owner';
}

function resolveLanguage(setting: string): OfficeLanguage {
  if (setting === 'cs' || setting === 'en') {
    return setting;
  }
  const osLocale = Intl.DateTimeFormat().resolvedOptions().locale;
  const locale = osLocale || vscode.env.language || 'en';
  return locale.toLowerCase().startsWith('cs') ? 'cs' : 'en';
}

function readHexColor(
  configuration: vscode.WorkspaceConfiguration,
  key: string,
  fallback: string
): string {
  const value = configuration.get<string>(key, fallback).trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

function readChoice<const T extends readonly string[]>(
  configuration: vscode.WorkspaceConfiguration,
  key: string,
  values: T,
  fallback: T[number]
): T[number] {
  const value = configuration.get<string>(key, fallback);
  return values.includes(value) ? value as T[number] : fallback;
}

function readBoolean(
  configuration: vscode.WorkspaceConfiguration,
  key: string,
  fallback: boolean
): boolean {
  const value = configuration.get<unknown>(key, fallback);
  return typeof value === 'boolean' ? value : fallback;
}

function readString(
  configuration: vscode.WorkspaceConfiguration,
  key: string,
  fallback: string
): string {
  const value = configuration.get<unknown>(key, fallback);
  return typeof value === 'string' ? value : fallback;
}

function validateSettingValue(key: string, value: unknown): unknown {
  if (key === 'language') {
    return languageSettings.includes(value as typeof languageSettings[number]) ? value : undefined;
  }
  if (key === 'ownerAppearance.hairStyle') {
    return hairStyles.includes(value as typeof hairStyles[number]) ? value : undefined;
  }
  if (key === 'ownerAppearance.facialHair') {
    return facialHairStyles.includes(value as typeof facialHairStyles[number]) ? value : undefined;
  }
  if (key === 'ownerAppearance.eyewear') {
    return eyewearStyles.includes(value as typeof eyewearStyles[number]) ? value : undefined;
  }
  if (
    key === 'ownerAppearance.hairColor'
    || key === 'ownerAppearance.skinColor'
    || key === 'shirtColors.owner'
    || key === 'shirtColors.manager'
    || key === 'shirtColors.chat'
    || key === 'shirtColors.subagent'
  ) {
    return normalizeHexColor(value);
  }
  if (key === 'hud.showModel' || key === 'hud.showTokens' || key === 'hud.showActivity') {
    return typeof value === 'boolean' ? value : undefined;
  }
  if (key === 'officeName' || key === 'officeLogoPath') {
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function normalizeHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

async function updateSetting(
  configuration: vscode.WorkspaceConfiguration,
  key: string,
  value: unknown,
  target: vscode.ConfigurationTarget
): Promise<void> {
  await configuration.update(key, value, target);
}
