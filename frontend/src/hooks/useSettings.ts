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

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const savedSettings = await db.getSettings();
      setSettings(savedSettings || DEFAULT_SETTINGS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
      console.error('Error loading settings:', err);
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSettings = useCallback(async (newSettings: Partial<Settings>) => {
    try {
      const updatedSettings = { ...settings, ...newSettings };
      await db.saveSettings(updatedSettings);
      setSettings(updatedSettings);
      
      // Apply theme if changed
      if (newSettings.theme) {
        applyTheme(newSettings.theme);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
      throw err;
    }
  }, [settings]);

  const applyTheme = (theme: 'light' | 'dark' | 'system') => {
    const root = document.documentElement;
    
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    } else {
      root.classList.toggle('dark', theme === 'dark');
    }
  };

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
    refreshSettings: loadSettings,
  };
};
