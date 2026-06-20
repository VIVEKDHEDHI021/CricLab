import React, { useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  ArrowLeft, 
  Download, 
  Printer, 
  Share2, 
  RefreshCw, 
  Trash2, 
  Upload, 
  FileText, 
  AlertCircle,
  CheckCircle2,
  Lock,
  Plus,
  DatabaseZap,
  HardDrive,
  Cloud
} from "lucide-react";
import { backupService, type BackupRegistryEntry } from "@/lib/services/backupService";
import { matchService } from "@/lib/services/matchService";

export const Route = createFileRoute("/backup-center")({
  component: BackupCenter,
});

function BackupCenter() {
  const navigate = useNavigate();
  const [registry, setRegistry] = useState<BackupRegistryEntry[]>([]);
  const [completedMatches, setCompletedMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importingFile, setImportingFile] = useState(false);
  const [exportingFull, setExportingFull] = useState(false);

  // Clear All Data state
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearingAll, setClearingAll] = useState(false);

  // Import Dialog states
  const [importFileToProcess, setImportFileToProcess] = useState<File | null>(null);
  const [importFileData, setImportFileData] = useState<any | null>(null);
  const [showImportConfirmDialog, setShowImportConfirmDialog] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importPreview, setImportPreview] = useState<{ matchCount: number; teamCount: number; playerCount: number; dateString: string } | null>(null);

  const [uploadingMatchId, setUploadingMatchId] = useState<string | null>(null);

  const handleUploadToServer = async (matchId: string) => {
    setUploadingMatchId(matchId);
    const toastId = toast.loading("Syncing match scorecard to server...");
    try {
      await matchService.uploadMatchToServer(matchId);
      toast.success("Match scorecard successfully synced to server!", { id: toastId });
      
      // Update local backup status registry as exported
      try {
        const backupData = await backupService.exportSingleMatchBackup(matchId);
        backupService.saveLocalBackup(matchId, backupData);
      } catch (regErr) {
        console.warn("Failed to update registry status:", regErr);
      }
      
      loadData();
    } catch (e: any) {
      toast.error("Failed to sync match to server: " + e.message, { id: toastId });
    } finally {
      setUploadingMatchId(null);
    }
  };

  const handleClearAllData = async () => {
    if (clearConfirmText !== 'RESET') {
      toast.error('Type RESET to confirm.');
      return;
    }
    setClearingAll(true);
    try {
      await backupService.cleanDatabase();
      toast.success('All local data cleared. The app will reload now.');
      setShowClearDialog(false);
      setTimeout(() => { window.location.href = '/'; }, 1500);
    } catch (e: any) {
      toast.error('Failed to clear data: ' + e.message);
    } finally {
      setClearingAll(false);
      setClearConfirmText('');
    }
  };

  // Load completed matches and backup registry
  const loadData = async () => {
    setLoading(true);
    try {
      const localRegistry = backupService.getBackupRegistry();
      setRegistry(localRegistry);

      const allMatches = await matchService.getMatches();
      const completed = allMatches.filter(m => m.status === 'past' || m.status === 'completed');
      setCompletedMatches(completed);

      // Auto-synchronize registry for completed matches that aren't in registry yet
      const updatedRegistry = [...localRegistry];
      let registryChanged = false;

      completed.forEach(m => {
        const exists = updatedRegistry.some(r => r.matchId === m.id);
        if (!exists) {
          const teamA = m.team_a?.name || 'Team A';
          const teamB = m.team_b?.name || 'Team B';
          const dateStr = m.match_date ? new Date(m.match_date).toISOString().split('T')[0] : '2026-06-10';
          
          updatedRegistry.push({
            matchId: m.id,
            date: dateStr,
            teams: `${teamA} vs ${teamB}`,
            result: m.result || 'Match Completed',
            version: 1,
            status: 'Pending'
          });
          registryChanged = true;
        }
      });

      if (registryChanged) {
        localStorage.setItem('criclab_backup_registry', JSON.stringify(updatedRegistry));
        setRegistry(updatedRegistry);
      }
    } catch (e: any) {
      console.warn("Failed to load matches list:", e);
      toast.error("Could not load latest matches. Using local cache.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Action: Export JSON Backup (Single Match)
  const handleExportJSON = async (matchId: string) => {
    try {
      const backupData = await backupService.exportSingleMatchBackup(matchId);

      const registryEntry = registry.find(r => r.matchId === matchId);
      const teamsLabel = registryEntry ? registryEntry.teams : "Match";
      const cleanTeamsLabel = teamsLabel.replace(/\s+/g, '_');
      const filename = `${cleanTeamsLabel}_v${backupData.version || 1}.json`;

      await backupService.saveBackupFileToFilesystem(filename, backupData);
      backupService.saveLocalBackup(matchId, backupData);
      
      toast.success(`Backup saved successfully as ${filename}`);
      loadData();
    } catch (e: any) {
      toast.error(`Failed to export backup: ${e.message}`);
    }
  };

  // Action: Export Entire Database JSON Backup
  const handleExportFullBackup = async () => {
    setExportingFull(true);
    try {
      const data = await backupService.exportBackup();
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `criclab_full_backup_${timestamp}.json`;

      await backupService.saveBackupFileToFilesystem(filename, data);
      toast.success(`Complete backup saved successfully as ${filename}`);
    } catch (e: any) {
      toast.error(`Failed to export entire database: ${e.message}`);
    } finally {
      setExportingFull(false);
    }
  };

  // Action: Delete Local Backup
  const handleDeleteLocal = (matchId: string) => {
    if (!confirm("Are you sure you want to delete the local backup file? The match registry status will return to pending.")) return;
    backupService.deleteLocalBackup(matchId);
    toast.success("Local backup file deleted from device storage.");
    loadData();
  };

  // Action: Share Backup
  const handleShareBackup = async (matchId: string) => {
    const registryEntry = registry.find(r => r.matchId === matchId);
    if (!registryEntry) return;

    const shareTitle = "CricLab Match Backup";
    const shareText = `Match: ${registryEntry.teams}\nResult: ${registryEntry.result}\nDate: ${registryEntry.date}\nVersion: ${registryEntry.version}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
        });
        toast.success("Shared successfully!");
      } else {
        await navigator.clipboard.writeText(shareText);
        toast.success("Match summary copied to clipboard!");
      }
    } catch (e) {
      console.warn("Share failed:", e);
    }
  };

  // Action: PDF Export (Native Printable scorecard)
  const handleExportPDF = async (matchId: string) => {
    try {
      const detail = await matchService.getMatch(matchId);
      const m = detail.m;
      const teams = detail.teams || [];
      const innings = detail.innings || [];
      const players = detail.players || [];
      const balls = detail.balls || [];

      const teamName = (tid: string) => teams.find((t: any) => t.id === tid)?.name || "—";

      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        toast.error("Popup blocked! Please allow popups to export PDF/Print.");
        return;
      }

      let inningsHtml = "";
      innings.forEach((inn: any) => {
        const innBalls = balls.filter((b: any) => b.innings_id === inn.id);
        const battingTeamId = inn.batting_team_id;
        const bowlingTeamId = inn.bowling_team_id;

        let battersRowsHtml = "";
        const battingPlayers = players.filter((p: any) => p.team_id === battingTeamId);
        battingPlayers.forEach((p: any) => {
          const facedBalls = innBalls.filter((b: any) => b.batter_id === p.id);
          const runs = facedBalls.reduce((sum: number, b: any) => sum + (b.runs || 0), 0);
          const ballsCount = facedBalls.filter((b: any) => b.extra_type !== "wide").length;
          const fours = facedBalls.filter((b: any) => b.runs === 4).length;
          const sixes = facedBalls.filter((b: any) => b.runs === 6).length;
          const sr = ballsCount > 0 ? ((runs / ballsCount) * 100).toFixed(1) : "0.0";
          
          const wicketBall = innBalls.find((b: any) => b.is_wicket && b.batter_id === p.id);
          let dismissalText = "dnb";
          
          const hasBatted = facedBalls.length > 0 || innBalls.some((b: any) => b.non_striker_id === p.id);
          if (hasBatted) {
            if (wicketBall) {
              const bowlerName = players.find((pl: any) => pl.id === wicketBall.bowler_id)?.name || "Bowler";
              if (wicketBall.wicket_type === "bowled") dismissalText = `b ${bowlerName}`;
              else if (wicketBall.wicket_type === "caught") {
                const catcherName = players.find((pl: any) => pl.id === wicketBall.caught_by_id)?.name || "Fielder";
                dismissalText = `c ${catcherName} b ${bowlerName}`;
              } else if (wicketBall.wicket_type === "lbw") dismissalText = `lbw b ${bowlerName}`;
              else if (wicketBall.wicket_type === "run_out") dismissalText = "run out";
              else dismissalText = "out";
            } else {
              dismissalText = "not out";
            }
          }

          if (hasBatted) {
            battersRowsHtml += `
              <tr>
                <td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">${p.name}</td>
                <td style="padding:8px; border-bottom:1px solid #ddd; color:#555;">${dismissalText}</td>
                <td style="padding:8px; border-bottom:1px solid #ddd; text-align:right; font-weight:bold;">${runs}</td>
                <td style="padding:8px; border-bottom:1px solid #ddd; text-align:right;">${ballsCount}</td>
                <td style="padding:8px; border-bottom:1px solid #ddd; text-align:right;">${fours}</td>
                <td style="padding:8px; border-bottom:1px solid #ddd; text-align:right;">${sixes}</td>
                <td style="padding:8px; border-bottom:1px solid #ddd; text-align:right; font-family:monospace;">${sr}</td>
              </tr>
            `;
          }
        });

        let bowlersRowsHtml = "";
        const bowlingPlayers = players.filter((p: any) => p.team_id === bowlingTeamId);
        bowlingPlayers.forEach((p: any) => {
          const bowlerBalls = innBalls.filter((b: any) => b.bowler_id === p.id);
          const legalBalls = bowlerBalls.filter((b: any) => b.is_legal).length;
          if (legalBalls === 0) return;

          const wickets = bowlerBalls.filter((b: any) => b.is_wicket && b.wicket_type !== "run_out" && b.wicket_type !== "retired_hurt").length;
          const runsConceded = bowlerBalls.reduce((sum: number, b: any) => sum + (b.runs || 0), 0) + 
                                bowlerBalls.filter((b: any) => b.extra_type === "wide" || b.extra_type === "no_ball")
                                         .reduce((sum: number, b: any) => sum + (b.extra_runs || 0), 0);
          const econ = legalBalls > 0 ? ((runsConceded / (legalBalls / 6))).toFixed(2) : "0.00";
          const overs = `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;

          const oversGrouped = bowlerBalls.reduce((acc: any, b: any) => {
            const key = `${b.innings_id}_${b.over_number}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(b);
            return acc;
          }, {});
          
          let maidens = 0;
          Object.values(oversGrouped).forEach((overBalls: any) => {
            const legalInOver = overBalls.filter((b: any) => b.is_legal).length;
            if (legalInOver >= 6) {
              const overRuns = overBalls.reduce((sum: number, b: any) => sum + (b.runs || 0), 0) + 
                               overBalls.filter((b: any) => b.extra_type === "wide" || b.extra_type === "no_ball")
                                        .reduce((sum: number, b: any) => sum + (b.extra_runs || 0), 0);
              if (overRuns === 0) {
                maidens++;
              }
            }
          });

          bowlersRowsHtml += `
            <tr>
              <td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">${p.name}</td>
              <td style="padding:8px; border-bottom:1px solid #ddd; text-align:right;">${overs}</td>
              <td style="padding:8px; border-bottom:1px solid #ddd; text-align:right;">${maidens}</td>
              <td style="padding:8px; border-bottom:1px solid #ddd; text-align:right;">${runsConceded}</td>
              <td style="padding:8px; border-bottom:1px solid #ddd; text-align:right; font-weight:bold;">${wickets}</td>
              <td style="padding:8px; border-bottom:1px solid #ddd; text-align:right; font-family:monospace;">${econ}</td>
            </tr>
          `;
        });

        const wides = innBalls.filter((b: any) => b.extra_type === "wide").reduce((sum: number, b: any) => sum + (b.extra_runs || 0), 0);
        const noBalls = innBalls.filter((b: any) => b.extra_type === "no_ball").reduce((sum: number, b: any) => sum + (b.extra_runs || 0), 0);
        const byes = innBalls.filter((b: any) => b.extra_type === "bye").reduce((sum: number, b: any) => sum + (b.extra_runs || 0), 0);
        const legByes = innBalls.filter((b: any) => b.extra_type === "leg_bye").reduce((sum: number, b: any) => sum + (b.extra_runs || 0), 0);
        const totalExtras = wides + noBalls + byes + legByes;

        inningsHtml += `
          <div style="margin-top:24px; background:#fff; border:1px solid #eee; border-radius:12px; padding:16px; page-break-inside:avoid;">
            <h3 style="margin-top:0; color:#ea580c; border-bottom:2px solid #ea580c; padding-bottom:6px; text-transform:uppercase;">
              ${teamName(battingTeamId)} - Innings ${inn.innings_no}
            </h3>
            
            <table style="width:100%; border-collapse:collapse; text-align:left; font-size:13px; margin-bottom:16px;">
              <thead>
                <tr style="background:#f8f9fa;">
                  <th style="padding:8px; border-bottom:2px solid #ddd;">Batter</th>
                  <th style="padding:8px; border-bottom:2px solid #ddd;">Dismissal</th>
                  <th style="padding:8px; border-bottom:2px solid #ddd; text-align:right;">Runs</th>
                  <th style="padding:8px; border-bottom:2px solid #ddd; text-align:right;">Balls</th>
                  <th style="padding:8px; border-bottom:2px solid #ddd; text-align:right;">4s</th>
                  <th style="padding:8px; border-bottom:2px solid #ddd; text-align:right;">6s</th>
                  <th style="padding:8px; border-bottom:2px solid #ddd; text-align:right;">SR</th>
                </tr>
              </thead>
              <tbody>
                ${battersRowsHtml}
                <tr style="background:#fdfefe; font-weight:bold;">
                  <td style="padding:8px;" colspan="2">Extras (wides ${wides}, noballs ${noBalls}, byes ${byes}, legbyes ${legByes})</td>
                  <td style="padding:8px; text-align:right;" colspan="5">${totalExtras}</td>
                </tr>
                <tr style="background:#f2f4f4; font-weight:black; font-size:15px;">
                  <td style="padding:10px;" colspan="2">TOTAL (Overs ${Math.floor(inn.legal_balls / 6)}.${inn.legal_balls % 6})</td>
                  <td style="padding:10px; text-align:right;" colspan="5">${inn.runs}/${inn.wickets}</td>
                </tr>
              </tbody>
            </table>

            <h4 style="margin-bottom:8px; color:#555; text-transform:uppercase;">Bowling Card</h4>
            <table style="width:100%; border-collapse:collapse; text-align:left; font-size:13px;">
              <thead>
                <tr style="background:#f8f9fa;">
                  <th style="padding:8px; border-bottom:2px solid #ddd;">Bowler</th>
                  <th style="padding:8px; border-bottom:2px solid #ddd; text-align:right;">Overs</th>
                  <th style="padding:8px; border-bottom:2px solid #ddd; text-align:right;">Maidens</th>
                  <th style="padding:8px; border-bottom:2px solid #ddd; text-align:right;">Runs</th>
                  <th style="padding:8px; border-bottom:2px solid #ddd; text-align:right;">Wickets</th>
                  <th style="padding:8px; border-bottom:2px solid #ddd; text-align:right;">Econ</th>
                </tr>
              </thead>
              <tbody>
                ${bowlersRowsHtml}
              </tbody>
            </table>
          </div>
        `;
      });

      const scorecardHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>CricLab Scorecard - ${teamName(m.team_a_id)} vs ${teamName(m.team_b_id)}</title>
          <style>
            body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #333; margin: 40px; line-height:1.4; }
            .header { text-align: center; border-bottom: 3px double #ddd; padding-bottom: 20px; }
            .header h1 { margin: 0 0 8px 0; font-size: 28px; color: #ea580c; text-transform: uppercase; letter-spacing: 1px; }
            .header p { margin: 4px 0; color: #666; font-size: 14px; }
            .result { font-size: 18px; font-weight: bold; color: #ea580c; text-align: center; margin: 20px 0; background: #fff7ed; padding: 12px; border-radius: 8px; border: 1px solid #ffedd5; }
            @media print {
              body { margin: 20px; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div style="max-width:800px; margin:0 auto;">
            <div style="text-align:right; margin-bottom:20px;">
              <button onclick="window.print()" style="background:#ea580c; color:#fff; border:none; padding:8px 16px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:14px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                🖨 Print Scorecard / Save PDF
              </button>
            </div>
            
            <div class="header">
              <h1>CricLab Match Scorecard</h1>
              <p style="font-size:18px; font-weight:bold; color:#111;">${teamName(m.team_a_id)} vs ${teamName(m.team_b_id)}</p>
              <p>Ground: <strong>${m.ground || "N/A"}</strong> · Date: <strong>${new Date(m.match_date).toLocaleDateString()}</strong> · Match Type: <strong>${m.match_type || "N/A"}</strong></p>
            </div>

            <div class="result">
              ${m.result || "Match Finished"}
            </div>

            ${inningsHtml}

            <div style="margin-top:24px; padding:16px; border:1px solid #eee; border-radius:12px; background:#fcfcfc;">
              <h3 style="margin-top:0; color:#444; border-bottom:1px solid #ddd; padding-bottom:6px; text-transform:uppercase; font-size:14px;">Match Summary</h3>
              <p style="margin:6px 0; font-size:13px;">Overs Count: <strong>${m.overs} overs</strong></p>
              <p style="margin:6px 0; font-size:13px;">Match Status: <strong>Archived (Completed)</strong></p>
            </div>
          </div>
        </body>
        </html>
      `;

      printWindow.document.write(scorecardHtml);
      printWindow.document.close();
      toast.success("Scorecard ready for printing/PDF generation.");
    } catch (e: any) {
      toast.error("Failed to generate scorecard PDF: " + e.message);
    }
  };

  // Action: Restore Match from Registry Backup (defaults to Merge for safety)
  const handleRestoreFromLocal = async (matchId: string) => {
    if (!confirm("Are you sure you want to restore this match data from the local backup? This will safely merge or update records without deleting other matches.")) return;
    try {
      const backupData = backupService.getLocalBackup(matchId);
      if (!backupData) {
        toast.error("Local backup file data not found.");
        return;
      }

      const jsonStr = JSON.stringify(backupData);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const file = new File([blob], `restore_${matchId}.json`, { type: "application/json" });

      const res = await backupService.importBackup(file, 'merge');
      toast.success(res.message || "Match successfully restored!");
      loadData();
    } catch (e: any) {
      toast.error(`Restore failed: ${e.message}`);
    }
  };

  // Action: Global File Import
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingFile(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);

        const validation = backupService.validateBackupJSON(data);
        if (!validation.valid) {
          toast.error(validation.error || "Invalid Backup File", { duration: 6000 });
          return;
        }

        const preview = backupService.previewBackup(data);
        setImportFileToProcess(file);
        setImportFileData(data);
        setImportPreview(preview);
        setImportMode('merge');
        setShowImportConfirmDialog(true);
      } catch (err: any) {
        toast.error(`Failed to parse file: ${err.message}`);
      } finally {
        setImportingFile(false);
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (!importFileToProcess || !importFileData) return;
    setImportingFile(true);
    try {
      const res = await backupService.importBackup(importFileToProcess, importMode);
      
      if (importFileData.matches && importFileData.matches.length > 0) {
        const match = importFileData.matches[0];
        backupService.saveLocalBackup(match.id, importFileData);
      }

      toast.success(res.message || "Backup data successfully imported!");
      setShowImportConfirmDialog(false);
      setImportFileToProcess(null);
      setImportFileData(null);
      setImportPreview(null);
      loadData();
    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
    } finally {
      setImportingFile(false);
    }
  };

  return (
    <AppShell title="Backup Center">
      <div className="space-y-5">
        {/* Header navigation */}
        <div className="flex items-center gap-3">
          <Link to="/profile">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
              Backup Center
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Universal local-first backups & data recovery center.
            </p>
          </div>
        </div>

        {/* Global Export Section */}
        <Card className="p-5 border border-primary/20 bg-gradient-to-br from-card to-card/60 backdrop-blur rounded-2xl shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
          
          <h2 className="text-sm font-black text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <HardDrive className="h-4 w-4 text-primary" /> Database Backup Manager
          </h2>
          <p className="text-[11px] text-muted-foreground mb-4">
            Export all CricEngine V2 stats, matches, teams, squads, settings, and player history to a secure offline JSON file.
          </p>

          <Button
            onClick={handleExportFullBackup}
            disabled={exportingFull}
            className="w-full flex items-center justify-center gap-2 text-xs h-10 bg-gradient-to-r from-primary to-orange-600 hover:opacity-95 text-white font-black uppercase tracking-wider rounded-xl shadow-md transition-transform active:scale-95 cursor-pointer"
          >
            {exportingFull ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exportingFull ? "Generating Backup..." : "Export Complete Database Backup"}
          </Button>
        </Card>

        {/* Global Import Section */}
        <Card className="p-5 border border-primary/20 bg-gradient-to-br from-card to-card/60 backdrop-blur rounded-2xl shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
          
          <h2 className="text-sm font-black text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Upload className="h-4 w-4 text-primary" /> Import Backup File
          </h2>
          <p className="text-[11px] text-muted-foreground mb-4">
            Upload any CricLab backup file (.json) to restore match scores, player metrics, and ball event records.
          </p>

          <div className="relative border-2 border-dashed border-border/80 hover:border-primary/40 rounded-xl p-5 text-center transition-colors cursor-pointer group bg-muted/5">
            <input 
              type="file" 
              accept=".json"
              onChange={handleFileImport}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={importingFile}
            />
            <div className="flex flex-col items-center gap-2">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:scale-105 transition-transform">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <span className="text-xs font-bold text-foreground">
                {importingFile ? "Verifying & Importing..." : "Click or drag CricLab backup JSON here"}
              </span>
              <span className="text-[9px] text-muted-foreground/60">
                Supports .json exports with security integrity verification
              </span>
            </div>
          </div>
        </Card>

        {/* ── Danger Zone ── */}
        <Card className="p-5 border border-red-500/30 bg-gradient-to-br from-red-950/20 to-card rounded-2xl shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-28 h-28 bg-red-500/5 rounded-full blur-2xl pointer-events-none" />
          <h2 className="text-sm font-black text-red-400 uppercase tracking-wider mb-1 flex items-center gap-2">
            <DatabaseZap className="h-4 w-4" /> Danger Zone
          </h2>
          <p className="text-[11px] text-muted-foreground mb-4">
            Permanently wipe all local matches, players, teams, and ball events from this device. This cannot be undone.
          </p>
          <Button
            variant="destructive"
            className="w-full gap-2 font-black text-sm rounded-xl"
            onClick={() => { setClearConfirmText(''); setShowClearDialog(true); }}
          >
            <Trash2 className="h-4 w-4" />
            Clear All Local Data
          </Button>
        </Card>

        {/* ── Clear All Confirmation Dialog ── */}
        <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
          <DialogContent className="max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-red-400 flex items-center gap-2">
                <DatabaseZap className="h-5 w-5" /> Clear All Data?
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-xs text-red-300 font-semibold leading-relaxed">
                  ⚠️ This will permanently delete <strong>all matches, players, teams, and ball events</strong> from this device's local database. Only the admin account will remain.
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Type <strong className="text-foreground font-black">RESET</strong> to confirm:</p>
                <Input
                  value={clearConfirmText}
                  onChange={e => setClearConfirmText(e.target.value.toUpperCase())}
                  placeholder="Type RESET here"
                  className="font-mono tracking-widest text-center border-red-500/40 focus:border-red-500"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setShowClearDialog(false)} disabled={clearingAll}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={clearConfirmText !== 'RESET' || clearingAll}
                onClick={handleClearAllData}
                className="gap-2"
              >
                {clearingAll ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {clearingAll ? 'Clearing...' : 'Yes, Clear Everything'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Import Validation & Confirmation Dialog ── */}
        <Dialog open={showImportConfirmDialog} onOpenChange={setShowImportConfirmDialog}>
          <DialogContent className="max-w-md rounded-2xl bg-card border border-border text-foreground">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2 font-black uppercase text-sm tracking-wide">
                <Upload className="h-5 w-5 text-primary" /> Confirm Import
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {importPreview && (
                <div className="p-3 bg-muted/10 border border-border/40 rounded-xl space-y-2">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Backup File Preview</h3>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-card p-2 rounded-lg border border-border/20">
                      <span className="text-[10px] text-muted-foreground block">Matches</span>
                      <span className="font-bold text-white">{importPreview.matchCount}</span>
                    </div>
                    <div className="bg-card p-2 rounded-lg border border-border/20">
                      <span className="text-[10px] text-muted-foreground block">Teams</span>
                      <span className="font-bold text-primary">{importPreview.teamCount}</span>
                    </div>
                    <div className="bg-card p-2 rounded-lg border border-border/20">
                      <span className="text-[10px] text-muted-foreground block">Players</span>
                      <span className="font-bold text-white">{importPreview.playerCount}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center pt-1">
                    Exported: {importPreview.dateString}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Import Strategy</label>
                <div className="grid grid-cols-2 gap-3">
                  <div 
                    onClick={() => setImportMode('merge')}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      importMode === 'merge' 
                        ? 'bg-primary/10 border-primary shadow-[0_0_12px_rgba(245,158,11,0.15)] text-foreground' 
                        : 'bg-muted/5 border-border/40 text-muted-foreground hover:bg-muted/10'
                    }`}
                  >
                    <span className="text-xs font-bold block mb-1">Merge Backup</span>
                    <span className="text-[9px] leading-relaxed block">
                      Safely upsert match data. Updates existing matches without deleting others. (Recommended)
                    </span>
                  </div>

                  <div 
                    onClick={() => setImportMode('replace')}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      importMode === 'replace' 
                        ? 'bg-red-500/10 border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.15)] text-foreground' 
                        : 'bg-muted/5 border-border/40 text-muted-foreground hover:bg-muted/10'
                    }`}
                  >
                    <span className="text-xs font-bold text-red-400 block mb-1">Overwrite DB</span>
                    <span className="text-[9px] leading-relaxed block">
                      Destructive restore. Wipes all matches, players, and teams before applying backup.
                    </span>
                  </div>
                </div>
              </div>

              {importMode === 'replace' && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-red-300 leading-normal font-semibold">
                    Warning: Replacing the database will erase all current offline stats and matches permanently. Only use if restoring to a fresh system.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => { setShowImportConfirmDialog(false); setImportFileToProcess(null); }} disabled={importingFile}>
                Cancel
              </Button>
              <Button
                variant={importMode === 'replace' ? 'destructive' : 'default'}
                disabled={importingFile}
                onClick={handleConfirmImport}
                className="gap-2"
              >
                {importingFile && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                {importingFile ? 'Restoring...' : 'Proceed with Restore'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* List of Matches and Export Status */}
        <div className="space-y-3">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-xs font-black text-muted-foreground uppercase tracking-widest">
              Match Backups Registry ({completedMatches.length})
            </h2>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={loadData} 
              className="h-7 text-[10px] font-black uppercase text-primary gap-1 px-2.5 rounded-full bg-primary/5 hover:bg-primary/10 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-8 text-sm text-muted-foreground animate-pulse">
              Syncing match records...
            </div>
          ) : completedMatches.length === 0 ? (
            <Card className="p-8 text-center border-dashed border-2 border-border/80 bg-muted/5 rounded-2xl flex flex-col items-center justify-center gap-1.5">
              <AlertCircle className="h-8 w-8 text-muted-foreground/60 mb-1" />
              <p className="text-sm font-semibold text-muted-foreground">No completed matches found</p>
              <p className="text-[11px] text-muted-foreground/60">
                Only matches that are fully scored and finalized appear in the backup center.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {completedMatches.map(m => {
                const regEntry = registry.find(r => r.matchId === m.id);
                const isExported = regEntry?.status === 'Exported';
                
                return (
                  <Card key={m.id} className="p-4 bg-card/40 border border-border/80 rounded-2xl flex flex-col gap-3 relative overflow-hidden">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground/80 block">
                          {regEntry?.date || new Date(m.match_date).toISOString().split('T')[0]} · {m.ground || 'Local Ground'}
                        </span>
                        <span className="text-sm font-black text-foreground block mt-0.5">
                          {m.team_a?.name || 'Team A'} vs {m.team_b?.name || 'Team B'}
                        </span>
                        <span className="text-xs text-primary font-bold block mt-1">
                          {m.result || 'Match Completed'}
                        </span>
                      </div>

                      {/* Export Status Badge */}
                      {isExported ? (
                        <Badge className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center gap-1 hover:bg-emerald-500/15">
                          <CheckCircle2 className="h-3 w-3" /> Exported (v{regEntry?.version || 1})
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center gap-1 hover:bg-amber-500/15">
                          <AlertCircle className="h-3 w-3" /> Backup Pending
                        </Badge>
                      )}
                    </div>

                    {/* Action grid for single match backup */}
                    <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 border-t border-border/40 pt-3 text-center">
                      <Link to="/matches/$id" params={{ id: m.id }} className="block">
                        <Button variant="outline" className="w-full text-[10px] font-bold h-9 px-1 rounded-xl gap-1">
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span>Scorecard</span>
                        </Button>
                      </Link>

                      <Button 
                        variant="outline" 
                        onClick={() => handleUploadToServer(m.id)}
                        disabled={uploadingMatchId !== null}
                        className="text-[10px] font-bold h-9 px-1 rounded-xl gap-1"
                      >
                        <Cloud className={`h-3.5 w-3.5 shrink-0 text-amber-500 ${uploadingMatchId === m.id ? "animate-spin" : ""}`} />
                        <span>Sync Cloud</span>
                      </Button>

                      <Button 
                        variant="outline" 
                        onClick={() => handleExportJSON(m.id)}
                        className="text-[10px] font-bold h-9 px-1 rounded-xl gap-1"
                      >
                        <Download className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>Export</span>
                      </Button>

                      <Button 
                        variant="outline" 
                        onClick={() => handleExportPDF(m.id)}
                        className="text-[10px] font-bold h-9 px-1 rounded-xl gap-1"
                      >
                        <Printer className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                        <span>PDF / Print</span>
                      </Button>

                      <Button 
                        variant="outline" 
                        onClick={() => handleShareBackup(m.id)}
                        className="text-[10px] font-bold h-9 px-1 rounded-xl gap-1"
                      >
                        <Share2 className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                        <span>Share</span>
                      </Button>

                      <Button 
                        variant="outline" 
                        onClick={() => handleRestoreFromLocal(m.id)}
                        disabled={!isExported}
                        className="text-[10px] font-bold h-9 px-1 rounded-xl gap-1 disabled:opacity-40"
                      >
                        <RefreshCw className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        <span>Restore</span>
                      </Button>

                      <Button 
                        variant="outline" 
                        onClick={() => handleDeleteLocal(m.id)}
                        disabled={!isExported}
                        className="text-[10px] font-bold h-9 px-1 rounded-xl gap-1 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5 shrink-0 text-red-500" />
                        <span>Delete</span>
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
