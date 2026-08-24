import * as vscode from 'vscode';

export type OfficeLanguage = 'cs' | 'en';
export type OfficeLanguageSetting = 'auto' | OfficeLanguage;
export type OfficeRoleColors = {
  owner: string;
  manager: string;
  chat: string;
  subagent: string;
};

export type OfficePreferences = {
  language: OfficeLanguage;
  roleColors: OfficeRoleColors;
};

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
    }
  };
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
