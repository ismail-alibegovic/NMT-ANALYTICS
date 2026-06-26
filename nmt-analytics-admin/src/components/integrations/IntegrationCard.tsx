import Button from '../ui/button/Button';
import Badge from '../ui/badge/Badge';

interface IntegrationCardProps {
    title: string;
    description: string;
    status: 'connected' | 'not_configured';
    icon?: React.ReactNode;
    onConfigure: () => void;
}

export default function IntegrationCard({
    title,
    description,
    status,
    icon,
    onConfigure
}: IntegrationCardProps) {
    return (
        <div className="flex flex-col h-full bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.05] rounded-xl p-6 transition-all hover:shadow-md">
            <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-brand-50 dark:bg-brand-500/10 rounded-lg text-brand-600 dark:text-brand-400">
                    {icon || (
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    )}
                </div>
                <Badge
                    variant="light"
                    color={status === 'connected' ? 'success' : 'light'}
                    size="sm"
                >
                    {status === 'connected' ? 'Connected' : 'Not configured'}
                </Badge>
            </div>

            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                {title}
            </h3>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 flex-grow">
                {description}
            </p>

            <Button
                variant={status === 'connected' ? 'outline' : 'primary'}
                className={`w-full ${status === 'connected' ? '' : 'bg-brand-500 hover:bg-brand-600 text-white'}`}
                onClick={onConfigure}
            >
                {status === 'connected' ? 'Uredi konfiguraciju' : 'Konfiguriraj'}
            </Button>
        </div>
    );
}
