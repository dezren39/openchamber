import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  SETTINGS_FIELDS_STACK_CLASS,
  SETTINGS_HELPER_CLASS,
  SettingsSection,
} from '@/components/sections/shared/SettingsSection';
import { RouteRulesAdvanced } from '@/components/sections/routing/RouteRulesAdvanced';
import { useI18n } from '@/lib/i18n';
import {
  answerRouteQuestion,
  fetchRouteRules,
  interpretRoute,
  routingContextFromProviders,
  undoRouteRule,
  type InterpretResult,
  type RouteRule,
} from '@/lib/routing/routeRulesApi';
import { useConfigStore } from '@/stores/useConfigStore';

type PendingQuestion = { sentence: string; key: string; question: string; options: string[] };

const errorText = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure));

/** Rules made from one sentence share a creation time and summary; they are undone together. */
const interpretationKey = (rule: RouteRule) => `${rule.createdAt}|${rule.text}|${rule.summary}`;

/** Describe a routing change in words; the rules apply at once and can be undone here. */
export const RouteRulesSection: React.FC = () => {
  const { t } = useI18n();
  const providers = useConfigStore((state) => state.providers);
  const [sentence, setSentence] = React.useState('');
  const [rules, setRules] = React.useState<RouteRule[] | null>(null);
  const [pending, setPending] = React.useState<PendingQuestion | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const context = React.useMemo(() => routingContextFromProviders(providers), [providers]);

  React.useEffect(() => {
    let cancelled = false;
    fetchRouteRules()
      .then((next) => {
        if (!cancelled) setRules(next);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(t('settings.rules.loadError', { error: errorText(failure) }));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const settle = (result: InterpretResult, asked: string) => {
    setError(null);
    if (result.status === 'applied') {
      setRules(result.rules);
      setNotice(t('settings.rules.applied', { summary: result.summary }));
      setPending(null);
      setSentence('');
      return;
    }
    setNotice(null);
    if (result.status === 'clarify') {
      setPending({ sentence: asked, key: result.key, question: result.question, options: result.options });
      return;
    }
    setPending(null);
    setError(t('settings.rules.unknown'));
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const asked = sentence.trim();
    if (!asked || busy) return;
    void run(async () => settle(await interpretRoute(asked, context), asked));
  };

  const choose = (label: string) => {
    if (!pending || busy) return;
    const current = pending;
    void run(async () => settle(await answerRouteQuestion(current.sentence, context, current.key, label), current.sentence));
  };

  const undo = (rule: RouteRule) => {
    if (busy) return;
    void run(async () => {
      setRules(await undoRouteRule(rule.id));
      setNotice(null);
    });
  };

  const groups = React.useMemo(() => {
    const map = new Map<string, RouteRule[]>();
    for (const rule of rules ?? []) {
      const key = interpretationKey(rule);
      map.set(key, [...(map.get(key) ?? []), rule]);
    }
    return [...map.values()];
  }, [rules]);

  return (
    <SettingsSection title={t('settings.rules.title')}>
      <div className={SETTINGS_FIELDS_STACK_CLASS}>
        <p className={SETTINGS_HELPER_CLASS}>{t('settings.rules.description')}</p>
        <div className="flex w-full min-w-0 items-center gap-2">
          <Input
            value={sentence}
            onChange={(event) => setSentence(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
            }}
            placeholder={t('settings.rules.placeholder')}
            aria-label={t('settings.rules.title')}
            maxLength={500}
            className="h-8 min-w-0 flex-1 rounded-md px-3"
          />
          <Button size="sm" variant="outline" onClick={submit} disabled={busy || sentence.trim().length === 0}>
            {busy ? t('settings.rules.busy') : t('settings.rules.submit')}
          </Button>
        </div>
        {pending ? (
          <div className="space-y-2">
            <p className="typography-ui-label text-foreground">{pending.question}</p>
            <div className="flex flex-wrap gap-2">
              {pending.options.map((option) => (
                <Button key={option} size="sm" variant="outline" onClick={() => choose(option)} disabled={busy}>
                  {option}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {notice ? <p className={SETTINGS_HELPER_CLASS}>{notice}</p> : null}
        {error ? <p className={SETTINGS_HELPER_CLASS}>{error}</p> : null}
        <div className="space-y-1">
          <p className={SETTINGS_HELPER_CLASS}>{t('settings.rules.activeTitle')}</p>
          {rules === null ? null : groups.length === 0 ? (
            <p className={SETTINGS_HELPER_CLASS}>{t('settings.rules.empty')}</p>
          ) : (
            groups.map((group) => (
              <div key={interpretationKey(group[0])} className="flex items-center gap-2">
                <span className="typography-meta min-w-0 flex-1 truncate text-foreground">{group[0].summary}</span>
                <Button size="sm" variant="ghost" onClick={() => undo(group[0])} disabled={busy}>
                  {t('settings.rules.undo')}
                </Button>
              </div>
            ))
          )}
        </div>
        <RouteRulesAdvanced />
      </div>
    </SettingsSection>
  );
};
