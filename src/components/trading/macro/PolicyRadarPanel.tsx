/**
 * PHASE 26 — POLICY RADAR & STRATEGIC PROJECT MONITOR
 * ====================================================
 * Dark institutional terminal panel displaying statutory government resolutions,
 * target capital commitments, and mega-infrastructure execution status.
 */

import React from 'react';
import type { PolicyEvent, StrategicProject } from '../../../lib/capital-cycle/types.ts';

interface PolicyRadarPanelProps {
  policies: readonly PolicyEvent[];
  projects: readonly StrategicProject[];
  asOfDate?: string;
}

export const PolicyRadarPanel: React.FC<PolicyRadarPanelProps> = ({
  policies,
  projects,
  asOfDate,
}) => {
  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-4 space-y-4 text-slate-200">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Policy Radar & Strategic Projects
          </h3>
        </div>
        {asOfDate && (
          <span className="text-[11px] font-mono text-slate-500">
            As of: {asOfDate}
          </span>
        )}
      </div>

      {/* Policies List */}
      <div className="space-y-2">
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase">
          Key Government Resolutions & Master Plans ({policies.length})
        </h4>
        {policies.length === 0 ? (
          <div className="text-xs text-slate-500 italic py-2">
            No active policy resolutions recorded.
          </div>
        ) : (
          <div className="space-y-2">
            {policies.map((p) => (
              <div
                key={p.policyEventId}
                className="bg-[#1e293b]/70 border border-slate-700/60 rounded p-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-400 font-mono">
                    {p.documentNumber}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                    {p.status}
                  </span>
                </div>
                <div className="text-xs font-medium text-slate-200">{p.title}</div>
                <div className="text-[11px] text-slate-400 line-clamp-2">
                  {p.description}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] text-slate-400">
                  <span>Authority: <strong className="text-slate-300">{p.issuingAuthority}</strong></span>
                  <span>•</span>
                  <span>Announced: <strong className="text-slate-300 font-mono">{p.announcementDate}</strong></span>
                  {p.targetInvestmentVnd && (
                    <>
                      <span>•</span>
                      <span className="text-amber-400 font-mono">
                        Target: {(p.targetInvestmentVnd / 1e12).toFixed(1)}T VND
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Projects List */}
      <div className="space-y-2 pt-2 border-t border-slate-800/80">
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase">
          National Mega-Projects Execution ({projects.length})
        </h4>
        {projects.length === 0 ? (
          <div className="text-xs text-slate-500 italic py-2">
            No active strategic projects registered.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {projects.map((proj) => (
              <div
                key={proj.projectId}
                className="bg-[#1e293b]/70 border border-slate-700/60 rounded p-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 font-mono">
                    {proj.name}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      proj.projectStatus === 'OPERATIONAL'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                        : proj.projectStatus === 'UNDER_CONSTRUCTION'
                          ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/40'
                          : 'bg-amber-950 text-amber-400 border border-amber-800/40'
                    }`}
                  >
                    {proj.projectStatus}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Owner: {proj.owner}</span>
                  {proj.progressPercent !== null && proj.progressPercent !== undefined && (
                    <span className="text-cyan-400 font-mono font-bold">
                      {proj.progressPercent}%
                    </span>
                  )}
                </div>
                {(proj.approvedInvestmentVnd || proj.estimatedInvestmentVnd) && (
                  <div className="text-[11px] text-slate-300 font-mono">
                    Investment: {((proj.approvedInvestmentVnd ?? proj.estimatedInvestmentVnd ?? 0) / 1e12).toFixed(1)}T VND
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
