import { useState, useEffect, useCallback } from 'react';
import type { Settings } from '../types';
import db from '../services/cloudApi';

// The category taxonomy (UPI, agri_* categories, festival gifting, PPF/NPS
// savings) and every hardcoded formatter elsewhere in this app assume an
// Indian household, so that's the sensible default for a first run —
// matches what the dashboard actually displayed before this redesign made
// currency formatting consistently respect this setting.
const DEFAULT_SETTINGS: Settings = {
  currency: 'INR',
  dateFormat: 'DD/MM/YYYY',
  theme: 'system',
  locale: 'en-IN',
};

function applyTheme(theme: 'light' | 'dark' | 'system') {
  const root = document.documentElement;
  
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    try {
      if (mode === 'initial') setLoading(true);
      setError(null);
      const savedSettings = await db.getSettings();
      setSettings(savedSettings || DEFAULT_SETTINGS);
    } catch (err) {
      console.error('Error loading settings:', err);
      if (mode === 'refresh') throw err;
      setError(err instanceof Error ? err.message : 'Failed to load settings');
      setSettings(DEFAULT_SETTINGS);
    } finally {
      if (mode === 'initial') setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings('initial');
  }, [loadSettings]);

  // Optimistic: the change (e.g. dark mode) applies instantly and is saved
  // in the background; if the save fails it's rolled back and the error is
  // thrown to the caller for a toast — it never takes the whole app down.
  const updateSettings = useCallback(async (newSettings: Partial<Settings>) => {
    const previous = settings;
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
    if (newSettings.theme) applyTheme(newSettings.theme);
    try {
      await db.saveSettings(updatedSettings);
    } catch (err) {
      setSettings(previous);
      applyTheme(previous.theme);
      throw err;
    }
  }, [settings]);


  // Apply theme on load
  useEffect(() => {
    if (!loading) {
      applyTheme(settings.theme);
    }
  }, [settings.theme, loading]);

  return {
    settings,
    loading,
    error,
    updateSettings,
    refreshSettings: () => loadSettings('refresh'),
  };
};
