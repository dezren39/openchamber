import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  SETTINGS_FIELDS_STACK_CLASS,
  SETTINGS_HELPER_CLASS,
  SettingsFieldRow,
} from '@/components/sections/shared/SettingsSection';
import { useI18n } from '@/lib/i18n';
import {
  downloadLocalModel,
  fetchLocalModel,
  fetchRouteSettings,
  saveRouteSettings,
  type LocalModelStatus,
  type RouteRulesSettings,
} from '@/lib/routing/routeRulesApi';

const STAGES = [
  { key: 'keywords', labelKey: 'settings.rules.advanced.keywords' },
  { key: 'local', labelKey: 'settings.rules.advanced.local' },
  { key: 'external', labelKey: 'settings.rules.advanced.external' },
] as const;

const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

const errorText = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure));

/** Thresholds and smart-step toggles, collapsed by default: the defaults are meant to work unchanged. */
export const RouteRulesAdvanced: React.FC = () => {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [settings, setSettings] = React.useState<RouteRulesSettings | null>(null);
  const [local, setLocal] = React.useState<LocalModelStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([fetchRouteSettings(), fetchLocalModel()])
      .then(([nextSettings, nextLocal]) => {
        if (cancelled) return;
        setSettings(nextSettings);
        setLocal(nextLocal);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(errorText(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    if (!local?.downloading) return;
    const timer = window.setInterval(() => {
      fetchLocalModel()
        .then(setLocal)
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [local?.downloading]);

  const save = (next: RouteRulesSettings) => {
    setSettings(next);
    saveRouteSettings(next)
      .then(setSettings)
      .catch((failure: unknown) => setError(errorText(failure)));
  };

  const download = () => {
    downloadLocalModel()
      .then(setLocal)
      .catch((failure: unknown) => setError(errorText(failure)));
  };

  return (
    <div className="space-y-3">
      <Button size="sm" variant="ghost" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {open ? t('settings.rules.advanced.hide') : t('settings.rules.advanced.show')}
      </Button>
      {open ? (
        <div className={SETTINGS_FIELDS_STACK_CLASS}>
          {error ? <p className={SETTINGS_HELPER_CLASS}>{error}</p> : null}
          {settings ? (
            <>
              <SettingsFieldRow label={t('settings.rules.advanced.stages')} settingsItem="rules.stages">
                <div className="flex flex-col gap-2">
                  {STAGES.map((stage) => (
                    <label key={stage.key} className="flex items-center gap-2 typography-ui-label">
                      <Switch
                        checked={settings.stages[stage.key]}
                        onCheckedChange={(checked) =>
                          save({ ...settings, stages: { ...settings.stages, [stage.key]: checked } })
                        }
                      />
                      {t(stage.labelKey)}
                    </label>
                  ))}
                </div>
              </SettingsFieldRow>
              <SettingsFieldRow
                label={t('settings.rules.advanced.learnAfter')}
                description={t('settings.rules.advanced.learnAfterInfo')}
                settingsItem="rules.learn-after"
              >
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={settings.learnAfter}
                  onChange={(event) => save({ ...settings, learnAfter: Number(event.target.value) })}
                  className="h-8 w-24"
                  aria-label={t('settings.rules.advanced.learnAfter')}
                />
              </SettingsFieldRow>
              <SettingsFieldRow
                label={t('settings.rules.advanced.waitPercentile')}
                description={t('settings.rules.advanced.waitPercentileInfo')}
                settingsItem="rules.wait-percentile"
              >
                <Input
                  type="number"
                  min={5}
                  max={75}
                  value={settings.waitPercentile}
                  onChange={(event) => save({ ...settings, waitPercentile: Number(event.target.value) })}
                  className="h-8 w-24"
                  aria-label={t('settings.rules.advanced.waitPercentile')}
                />
              </SettingsFieldRow>
              <SettingsFieldRow
                label={t('settings.rules.advanced.waitMinSamples')}
                description={t('settings.rules.advanced.waitMinSamplesInfo')}
                settingsItem="rules.wait-samples"
              >
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={settings.waitMinSamples}
                  onChange={(event) => save({ ...settings, waitMinSamples: Number(event.target.value) })}
                  className="h-8 w-24"
                  aria-label={t('settings.rules.advanced.waitMinSamples')}
                />
              </SettingsFieldRow>
            </>
          ) : null}
          {local ? (
            <SettingsFieldRow
              label={t('settings.rules.advanced.localModel', { label: local.label })}
              description={t('settings.rules.advanced.localModelInfo', { size: megabytes(local.bytes) })}
              settingsItem="rules.local-model"
            >
              {local.installed ? (
                <span className="typography-ui-label text-muted-foreground">{t('settings.rules.advanced.installed')}</span>
              ) : local.downloading ? (
                <span className="typography-ui-label text-muted-foreground">
                  {t('settings.rules.advanced.downloading', {
                    received: megabytes(local.downloadedBytes),
                    total: megabytes(local.bytes),
                  })}
                </span>
              ) : (
                <Button size="sm" variant="outline" onClick={download}>
                  {t('settings.rules.advanced.download')}
                </Button>
              )}
            </SettingsFieldRow>
          ) : null}
          {local?.error ? (
            <p className={SETTINGS_HELPER_CLASS}>{t('settings.rules.advanced.downloadError', { error: local.error })}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
