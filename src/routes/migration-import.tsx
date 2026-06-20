import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Database, FileArchive, RefreshCw, Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { migrationImportService } from '@/lib/services/migrationImportService';
import { sqliteService } from '@/lib/services/sqliteService';

export const Route = createFileRoute('/migration-import')({
  component: MigrationImportPage,
});

function MigrationImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  const handleStartFresh = async () => {
    setLoading(true);
    setStatusMessage('Initializing database...');
    try {
      // Trigger database initialization to run migrations and seed defaults
      await sqliteService.query('SELECT 1;'); // Triggers ensureInitialized()
      
      localStorage.setItem('criclab_setup_completed', 'true');
      toast.success('Offline workspace initialized successfully!');
      
      // Navigate to login
      navigate({ to: '/' });
    } catch (err: any) {
      console.error('Initialization failed:', err);
      toast.error('Failed to initialize local workspace: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      toast.error('Please select a valid migration ZIP package.');
      return;
    }

    setLoading(true);
    setProgress(0);
    setStatusMessage('Processing package...');

    try {
      await migrationImportService.importPackage(file, (percent, msg) => {
        setProgress(percent);
        setStatusMessage(msg);
      });

      toast.success('CricLab migration successful! You can now log in.');
      navigate({ to: '/' });
    } catch (err: any) {
      console.error('Migration failed:', err);
      toast.error(err.message || 'Migration failed. Please verify the ZIP package.');
      setStatusMessage('Migration failed: ' + (err.message || 'Unknown error'));
      setProgress(0);
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const triggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="min-h-screen bg-[#070303] text-foreground flex flex-col justify-center items-center px-4 py-8 relative select-none">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 bg-[#0e0705] pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#ea580c]/5 rounded-full blur-[140px] pointer-events-none" />

      <Card className="w-full max-w-lg bg-card/40 border-white/5 backdrop-blur-2xl rounded-3xl p-8 relative overflow-hidden z-10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)]">
        {/* Header */}
        <div className="text-center space-y-3 mb-8">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-[#ea580c] to-[#f97316] flex items-center justify-center mx-auto shadow-lg shadow-orange-500/25 border border-white/10">
            <Database className="h-8 w-8 text-white animate-pulse" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-white to-gray-400 bg-clip-text text-transparent">
            Import CricLab Data
          </h1>
          <p className="text-sm text-muted-foreground/80 max-w-sm mx-auto leading-relaxed">
            Transition your existing web matches, players, and squads into your offline-first mobile app.
          </p>
        </div>

        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".zip"
          className="hidden"
          disabled={loading}
        />

        {/* Body content */}
        {!loading ? (
          <div className="space-y-4">
            {/* Option 1: Import */}
            <button
              onClick={triggerFileSelect}
              className="w-full group text-left p-6 rounded-2xl border border-white/5 bg-card/60 hover:bg-card hover:border-[#ea580c]/50 transition-all duration-300 flex items-start gap-4 shadow-sm"
            >
              <div className="h-12 w-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-[#ea580c] border border-orange-500/20 group-hover:scale-105 transition-transform duration-300">
                <FileArchive className="h-6 w-6" />
              </div>
              <div className="flex-1 space-y-1">
                <h3 className="font-bold text-foreground group-hover:text-[#ea580c] transition-colors">
                  Import Migration Package
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Upload the exported ZIP file containing all web profiles, teams, matches, and media.
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground mt-1 group-hover:translate-x-1 transition-transform" />
            </button>

            {/* Option 2: Fresh Start */}
            <button
              onClick={handleStartFresh}
              className="w-full group text-left p-6 rounded-2xl border border-white/5 bg-card/20 hover:bg-card/40 hover:border-white/15 transition-all duration-300 flex items-start gap-4"
            >
              <div className="h-12 w-12 rounded-xl bg-white/5 flex items-center justify-center text-muted-foreground border border-white/10 group-hover:scale-105 transition-transform duration-300">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="flex-1 space-y-1">
                <h3 className="font-bold text-foreground">
                  Start Fresh
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Start scoring with a completely clean database. Setup local players manually.
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground mt-1 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        ) : (
          /* Loading / Progress View */
          <div className="space-y-6 py-6 text-center">
            <div className="relative inline-flex items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-[#ea580c]" />
              <span className="absolute text-xs font-bold text-foreground">{progress}%</span>
            </div>
            
            <div className="space-y-2">
              <h3 className="font-bold text-foreground">{statusMessage}</h3>
              <p className="text-xs text-muted-foreground">Please do not close the app during import.</p>
            </div>

            {/* Animated progress bar container */}
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-[#ea580c] to-[#f97316] shadow-[0_0_8px_#ea580c] transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 pt-4 border-t border-white/5">
          <p className="text-[10px] text-muted-foreground font-semibold tracking-wider uppercase">
            CricLab Mobile Scoring Suite
          </p>
        </div>
      </Card>
    </div>
  );
}
