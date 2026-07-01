import { useState } from 'react';
import PageMeta from '../../components/common/PageMeta';
import PageToolbar from '../../components/ui/PageToolbar';
import IntegrationCard from '../../components/integrations/IntegrationCard';
import ConfigureIntegrationModal from '../../components/integrations/ConfigureIntegrationModal';
import Button from '../../components/ui/button/Button';
import { useToast } from '../../context/ToastContext';
import { analyzeRevenueDrop, RevenueAnalysisResponse } from '../../api/ai';
import { formatCurrency } from '../../utils/business';
import { useApp } from '../../context/AppContext';

const Integrations = () => {
    const { success, error: toastError } = useToast();
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [selectedIntegration, setSelectedIntegration] = useState('');

    // Revenue Copilot State
    const [copilotDateFrom, setCopilotDateFrom] = useState('');
    const [copilotDateTo, setCopilotDateTo] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisData, setAnalysisData] = useState<RevenueAnalysisResponse | null>(null);

    const { userContext } = useApp();
    const [copiedWidget, setCopiedWidget] = useState(false);
    const orgId = userContext?.org?.id || '';
    const widgetUrl = `/api/public/${orgId}/widget`;
    const embedCode = orgId
      ? `<!-- Travline Booking Widget -->\n<iframe src="${widgetUrl}" width="100%" height="600" frameborder="0" style="border:none;max-width:400px;margin:0 auto;display:block;"></iframe>`
      : '';

    const copyToClipboard = async (text: string) => {
      try { await navigator.clipboard.writeText(text); setCopiedWidget(true); setTimeout(() => setCopiedWidget(false), 2000); }
      catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); setCopiedWidget(true); setTimeout(() => setCopiedWidget(false), 2000); }
    };

    // Mock state for integration status
    const [integrationStatuses, setIntegrationStatuses] = useState<Record<string, 'connected' | 'not_configured'>>({
        'AI Assistant': 'not_configured',
        'Documents Q&A': 'not_configured',
        'Crew Automations': 'not_configured',
    });

    const handleConfigure = (title: string) => {
        setSelectedIntegration(title);
        setIsConfigModalOpen(true);
    };

    const handleSaveConfig = () => {
        setIntegrationStatuses(prev => ({
            ...prev,
            [selectedIntegration]: 'connected'
        }));
    };

    const handleAnalyzeRevenue = async () => {
        if (!copilotDateFrom || !copilotDateTo) return;

        setIsAnalyzing(true);
        setAnalysisData(null);

        try {
            const data = await analyzeRevenueDrop(copilotDateFrom, copilotDateTo);
            setAnalysisData(data);
            success("Analiza završena");
        } catch (err: any) {
            console.error('Analysis failed:', err);
            toastError("Neuspjela analiza. Pokušajte ponovo.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <>
            <PageMeta title="Integrations | Travline" description="Manage system integrations and AI tools" />

            <PageToolbar
                title="Integracije i AI Alati"
                description="Povežite vanjske servise i koristite napredne AI funkcionalnosti"
                searchValue=""
                onSearchChange={() => { }}
                searchPlaceholder="Traži integracije..." // Hidden if we don't implement filtering logic but keeping prop for now
            />

            {/* Integrations Grid */}
            <div className="mb-10">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 px-1">
                    Dostupni Moduli
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <IntegrationCard
                        title="AI Assistant"
                        description="General purpose chat assistant za pomoć pri upravljanju platformom i generisanju sadržaja."
                        status={integrationStatuses['AI Assistant']}
                        onConfigure={() => handleConfigure('AI Assistant')}
                        icon={
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                        }
                    />
                    <IntegrationCard
                        title="Documents Q&A (RAG)"
                        description="Sistem za pretragu i odgovaranje na pitanja na osnovu vaših internih dokumenata i PDF-ova."
                        status={integrationStatuses['Documents Q&A']}
                        onConfigure={() => handleConfigure('Documents Q&A')}
                        icon={
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        }
                    />
                    <IntegrationCard
                        title="Crew Automations"
                        description="Napredni multi-agent sistem (CrewAI) za automatizaciju složenih poslovnih procesa."
                        status={integrationStatuses['Crew Automations']}
                        onConfigure={() => handleConfigure('Crew Automations')}
                        icon={
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                            </svg>
                        }
                    />
                </div>
            </div>

            {/* Revenue Copilot Section */}
            <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.05] rounded-xl p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 rounded-lg">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Revenue Copilot</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Analizirajte trendove prihoda koristeći AI</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Od datuma</label>
                        <input
                            type="date"
                            value={copilotDateFrom}
                            onChange={(e) => setCopilotDateFrom(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-white/[0.1] dark:bg-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Do datuma</label>
                        <input
                            type="date"
                            value={copilotDateTo}
                            onChange={(e) => setCopilotDateTo(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-white/[0.1] dark:bg-gray-900 dark:text-white"
                        />
                    </div>
                    <Button
                        onClick={handleAnalyzeRevenue}
                        disabled={isAnalyzing || !copilotDateFrom || !copilotDateTo}
                        className="bg-purple-600 hover:bg-purple-700 text-white w-full"
                    >
                        {isAnalyzing ? (
                            <span className="flex items-center gap-2 justify-center">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                Analiziranje...
                            </span>
                        ) : 'Analiziraj pad prihoda'}
                    </Button>
                </div>

                {/* Analysis Result Panel */}
                <div className={`rounded-xl p-6 border transition-all ${analysisData
                    ? 'bg-purple-50 border-purple-100 dark:bg-purple-900/10 dark:border-purple-900/20'
                    : 'bg-gray-50 border-gray-100 border-dashed dark:bg-white/[0.02] dark:border-white/[0.05]'
                    }`}>
                    {analysisData ? (
                        <div className="space-y-6">
                            {/* Header / Summary */}
                            <div>
                                <h4 className="font-semibold text-purple-900 dark:text-purple-300 mb-4 flex items-center gap-2">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                    </svg>
                                    AI Insight & Analysis
                                </h4>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-purple-100 dark:border-purple-900/30">
                                        <span className="text-xs text-gray-500 uppercase tracking-wider">Prihod</span>
                                        <div className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                                            {formatCurrency(analysisData.metrics.revenue_current)}
                                        </div>
                                        <div className={`text-xs mt-1 ${analysisData.metrics.revenue_change_pct >= 0 ? 'text-green-600' : 'text-red-600'
                                            }`}>
                                            {analysisData.metrics.revenue_change_pct > 0 ? '+' : ''}
                                            {analysisData.metrics.revenue_change_pct}% u odnosu na prošli period
                                        </div>
                                    </div>

                                    <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-purple-100 dark:border-purple-900/30">
                                        <span className="text-xs text-gray-500 uppercase tracking-wider">Broj uplata</span>
                                        <div className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                                            {analysisData.metrics.payment_count_current}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1">
                                            Prošli period: {analysisData.metrics.payment_count_previous}
                                        </div>
                                    </div>

                                    <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-purple-100 dark:border-purple-900/30">
                                        <span className="text-xs text-gray-500 uppercase tracking-wider">Prosječna uplata</span>
                                        <div className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                                            {formatCurrency(analysisData.metrics.avg_payment_current)}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1">
                                            vs {formatCurrency(analysisData.metrics.avg_payment_previous)}
                                        </div>
                                    </div>

                                    <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-purple-100 dark:border-purple-900/30">
                                        <span className="text-xs text-gray-500 uppercase tracking-wider">Neuspjelo / Pending</span>
                                        <div className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                                            {analysisData.metrics.failed_count_current} / {analysisData.metrics.pending_count_current}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1">
                                            Prošli: {analysisData.metrics.failed_count_previous} / {analysisData.metrics.pending_count_previous}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Signals */}
                            {analysisData.signals.length > 0 && (
                                <div>
                                    <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                                        Detektirani Signali
                                    </h5>
                                    <div className="space-y-3">
                                        {analysisData.signals.map((signal, idx) => (
                                            <div
                                                key={idx}
                                                className={`p-4 rounded-lg border-l-4 bg-white dark:bg-gray-800 shadow-sm ${signal.severity === 'high' ? 'border-l-red-500' :
                                                    signal.severity === 'medium' ? 'border-l-orange-400' :
                                                        'border-l-blue-400'
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <h6 className="font-semibold text-gray-900 dark:text-white">{signal.title}</h6>
                                                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                                            {signal.explanation}
                                                        </p>
                                                    </div>
                                                    <span className={`px-2 py-1 text-xs font-medium rounded capitalize ${signal.severity === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                                                        signal.severity === 'medium' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                                                            'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                                        }`}>
                                                        {signal.severity}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {analysisData.signals.length === 0 && (
                                <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm italic bg-white dark:bg-gray-800 rounded-lg">
                                    Nisu detektirani nikakvi negativni signali za odabrani period.
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                            <p>Odaberite period i pokrenite analizu da biste vidjeli AI preporuke za optimizaciju prihoda.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Booking Widget */}
            <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.05] rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Booking Widget</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Ugradite booking formu na svoju web stranicu</p>
                </div>
              </div>

              {orgId ? (
                <div className="space-y-4">
                  <div className="bg-gray-50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/[0.05] rounded-lg p-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Embed kod (iframe)</label>
                    <pre className="text-xs bg-gray-800 text-gray-100 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">{embedCode}</pre>
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => copyToClipboard(embedCode)}>
                      {copiedWidget ? '✓ Kopirano' : 'Kopiraj kod'}
                    </Button>
                  </div>
                  <div className="bg-gray-50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/[0.05] rounded-lg p-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Direktan link</label>
                    <a href={widgetUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-600 dark:text-brand-400 hover:underline break-all">
                      {widgetUrl}
                    </a>
                    <p className="text-xs text-gray-400 mt-2">Otvorite link da vidite kako widget izgleda. Zatim ugradite iframe kod na svoj sajt.</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-gray-400 text-sm">
                  Učitavanje podataka organizacije...
                </div>
              )}
            </div>

            <ConfigureIntegrationModal
                isOpen={isConfigModalOpen}
                onClose={() => setIsConfigModalOpen(false)}
                integrationTitle={selectedIntegration}
                onSave={handleSaveConfig}
            />
        </>
    );
};

export default Integrations;
