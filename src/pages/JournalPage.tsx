import React, { useState } from 'react';
import { JournalService } from '../services/product/JournalService';
import { JournalEngine } from '../lib/product/journal/JournalEngine';
import type { DecisionType } from '../lib/decision/types';

const inputCls = 'w-full text-sm bg-terminal-surface-elevated border border-terminal-border rounded px-2 py-1 text-terminal-text';

export const JournalPage: React.FC = () => {
  const [, tick] = useState(0);
  const refresh = () => tick((x) => x + 1);
  const entries = JournalService.list();
  const [sel, setSel] = useState<string | null>(null);
  const [f, setF] = useState({ symbol: '', title: '', thesis: '', ref: '', source: '', asOf: '', confidence: '', horizon: '', reviewDate: '' });
  const [snap, setSnap] = useState({ type: 'WATCH' as DecisionType, direction: 'HOLD' as const });
  const [rev, setRev] = useState({ outcome: '', changed: '', correct: '', wrong: '', lessons: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const cur = sel ? JournalService.get(sel) : null;

  const create = () => {
    if (!f.symbol.trim() || !f.title.trim() || !f.thesis.trim() || !f.ref.trim() || !f.asOf) return;
    const id = `j-${Date.now()}`;
    try {
      JournalService.create({
        id,
        symbol: f.symbol,
        title: f.title,
        thesis: {
          thesisId: `th-${id}`,
          instrumentId: f.symbol.trim().toUpperCase(),
          asOfDate: f.asOf,
          createdAt: new Date().toISOString(),
          coreThesis: f.thesis.trim(),
          supportingEvidence: [{ kind: 'user', ref: f.ref.trim(), asOfDate: f.asOf, source: f.source.trim() || 'user' }],
          invalidationConditions: [],
        },
        confidence: f.confidence ? Number(f.confidence) : null,
        timeHorizon: f.horizon || null,
        entryDate: f.asOf,
        reviewDate: f.reviewDate || null,
        createdAt: new Date().toISOString(),
      });
      setSel(id);
      refresh();
    } catch { /* validation errors stay local */ }
  };

  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold text-terminal-text">Investment Journal</h1>
        <p className="text-xs text-terminal-text-muted font-mono mt-1">Decision history over Decision OS — snapshots are immutable, reviews append-only.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div className="rounded border border-terminal-border bg-terminal-surface p-3 space-y-2">
          <div className="text-[11px] font-mono text-terminal-text-muted">NEW ENTRY</div>
          <input value={f.symbol} onChange={set('symbol')} placeholder="Symbol (HPG)" className={inputCls} />
          <input value={f.title} onChange={set('title')} placeholder="Title" className={inputCls} />
          <textarea value={f.thesis} onChange={set('thesis')} placeholder="Core thesis (evidence required)" className={inputCls} rows={2} />
          <input value={f.ref} onChange={set('ref')} placeholder="Evidence ref" className={inputCls} />
          <input value={f.source} onChange={set('source')} placeholder="Evidence source" className={inputCls} />
          <input value={f.asOf} onChange={set('asOf')} placeholder="As-of YYYY-MM-DD" className={inputCls} />
          <input value={f.confidence} onChange={set('confidence')} placeholder="Confidence 0-1 (optional)" className={inputCls} />
          <input value={f.horizon} onChange={set('horizon')} placeholder="Horizon (optional)" className={inputCls} />
          <input value={f.reviewDate} onChange={set('reviewDate')} placeholder="Review date (optional)" className={inputCls} />
          <button onClick={create} className="text-[11px] font-mono px-3 py-1.5 rounded bg-terminal-accent text-white">Create entry</button>
        </div>
        <div className="rounded border border-terminal-border bg-terminal-surface p-3 space-y-1">
          <div className="text-[11px] font-mono text-terminal-text-muted">ENTRIES ({entries.length})</div>
          {entries.length === 0 && <div className="text-xs text-terminal-text-muted">No entries yet.</div>}
          {entries.map((e) => (
            <button key={e.id} onClick={() => { setSel(e.id); refresh(); }} className={`block w-full text-left text-xs rounded border px-2 py-1.5 ${sel === e.id ? 'border-terminal-accent/50 bg-terminal-accent/10' : 'border-terminal-border'}`}>
              <span className="font-mono text-terminal-text">{e.symbol}</span>
              <span className="text-terminal-text-muted"> · {e.title}</span>
              <span className="block font-mono text-[10px] text-terminal-text-muted">{e.status} · {e.entryType}</span>
            </button>
          ))}
        </div>
        <div className="rounded border border-terminal-border bg-terminal-surface p-3 space-y-2">
          <div className="text-[11px] font-mono text-terminal-text-muted">DETAIL</div>
          {!cur && <div className="text-xs text-terminal-text-muted">Select an entry.</div>}
          {cur && (
            <>
              <div className="text-sm text-terminal-text font-medium">{cur.title}</div>
              <div className="text-[11px] font-mono text-terminal-text-muted">status {cur.status} · snapshot {cur.decisionSnapshot ? `${cur.decisionSnapshot.decisionStatus} (${cur.decisionSnapshot.decisionType})` : 'none'} · reviews {cur.reviews.length}</div>
              {cur.status === 'DRAFT' && <button onClick={() => { JournalService.activate(cur.id, new Date().toISOString()); refresh(); }} className="text-[11px] font-mono px-2 py-1 rounded border border-terminal-border">Activate</button>}
              {(cur.status === 'DRAFT' || cur.status === 'ACTIVE') && !cur.decisionSnapshot && (
                <div className="flex gap-1">
                  <select value={snap.type} onChange={(e) => setSnap((p) => ({ ...p, type: e.target.value as DecisionType }))} className="text-[11px] font-mono bg-terminal-surface border border-terminal-border rounded px-1 py-1">
                    {['BUY', 'ADD', 'HOLD', 'REDUCE', 'SELL', 'AVOID', 'WATCH', 'EXIT'].map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <select value={snap.direction} onChange={(e) => setSnap((p) => ({ ...p, direction: e.target.value as typeof snap.direction }))} className="text-[11px] font-mono bg-terminal-surface border border-terminal-border rounded px-1 py-1">
                    {['LONG', 'SHORT', 'FLAT', 'HOLD', 'CLOSE', 'REBALANCE'].map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <button
                    onClick={() => {
                      const th = cur.thesis?.supportingEvidence[0];
                      if (!th) return;
                      try {
                        JournalService.buildAndAttachSnapshot(cur.id, { proposedType: snap.type, direction: snap.direction, evidence: { ...th }, asOfDate: cur.entryDate, at: new Date().toISOString() });
                        refresh();
                      } catch { /* chain rejection stays local */ }
                    }}
                    className="text-[11px] font-mono px-2 py-1 rounded bg-terminal-accent text-white"
                  >
                    Snapshot decision
                  </button>
                </div>
              )}
              {cur.status === 'ACTIVE' && (
                <button onClick={() => { JournalService.markReviewDue(cur.id, cur.reviewDate ?? cur.entryDate, new Date().toISOString()); refresh(); }} className="text-[11px] font-mono px-2 py-1 rounded border border-terminal-border">Mark review due</button>
              )}
              {(cur.status === 'ACTIVE' || cur.status === 'REVIEW_DUE') && cur.decisionSnapshot && (
                <div className="space-y-1">
                  <input value={rev.outcome} onChange={(e) => setRev((p) => ({ ...p, outcome: e.target.value }))} placeholder="Actual outcome" className={inputCls} />
                  <input value={rev.changed} onChange={(e) => setRev((p) => ({ ...p, changed: e.target.value }))} placeholder="What changed" className={inputCls} />
                  <input value={rev.correct} onChange={(e) => setRev((p) => ({ ...p, correct: e.target.value }))} placeholder="What was correct" className={inputCls} />
                  <input value={rev.wrong} onChange={(e) => setRev((p) => ({ ...p, wrong: e.target.value }))} placeholder="What was wrong" className={inputCls} />
                  <input value={rev.lessons} onChange={(e) => setRev((p) => ({ ...p, lessons: e.target.value }))} placeholder="Lessons (comma separated)" className={inputCls} />
                  <button
                    onClick={() => {
                      try {
                        JournalService.addReview(cur.id, {
                          reviewId: `r-${Date.now()}`, decisionId: cur.decisionSnapshot!.decisionId,
                          originalDecision: cur.decisionSnapshot!.decisionType, originalEvidence: [...cur.decisionSnapshot!.evidence],
                          actualOutcome: rev.outcome || null, whatChanged: rev.changed ? [rev.changed] : [], whatWasCorrect: rev.correct ? [rev.correct] : [],
                          whatWasWrong: rev.wrong ? [rev.wrong] : [], lessons: rev.lessons.split(',').map((s) => s.trim()).filter(Boolean),
                          newDecision: null, reviewedAt: new Date().toISOString(),
                        });
                        refresh();
                      } catch { /* stays local */ }
                    }}
                    className="text-[11px] font-mono px-2 py-1 rounded border border-terminal-accent/30 bg-terminal-accent/10 text-terminal-accent"
                  >
                    Add review
                  </button>
                </div>
              )}
              {cur.status === 'REVIEWED' && <button onClick={() => { JournalService.close(cur.id, new Date().toISOString()); refresh(); }} className="text-[11px] font-mono px-2 py-1 rounded border border-terminal-border">Close</button>}
              <div className="text-[11px] font-mono text-terminal-text-muted">
                Quality: {JournalEngine.assessQuality(
                  cur.reviews.length > 0 ? cur.reviews[0].whatWasCorrect.length > 0 : null,
                  cur.reviews.length > 0 ? (cur.reviews[0].actualOutcome ?? '').length > 0 && cur.reviews[0].whatWasWrong.length === 0 : null,
                )} · Lessons: {JournalEngine.compareThesisVsOutcome(cur).lessons.join('; ') || '—'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
