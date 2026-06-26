import { useState, useEffect } from 'react';
import { Modal } from '../ui/modal';
import Button from '../ui/button/Button';
import Input from '../form/input/InputField';
import Label from '../form/Label';
import Select from '../form/Select';
import { useToast } from '../../context/ToastContext';

interface ConfigureIntegrationModalProps {
    isOpen: boolean;
    onClose: () => void;
    integrationTitle: string;
    onSave: (config: any) => void;
}

export default function ConfigureIntegrationModal({
    isOpen,
    onClose,
    integrationTitle,
    onSave
}: ConfigureIntegrationModalProps) {
    const { success: showSuccess } = useToast();
    const [apiUrl, setApiUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState('gpt-4');
    const [isSaving, setIsSaving] = useState(false);

    // Reset form when opening for a different integration or first time
    useEffect(() => {
        if (isOpen) {
            setApiUrl('');
            setApiKey('');
            setModel('gpt-4');
        }
    }, [isOpen, integrationTitle]);

    const handleSave = () => {
        setIsSaving(true);

        // Simulate API call
        setTimeout(() => {
            onSave({ apiUrl, apiKey, model });
            showSuccess(`Konfiguracija za ${integrationTitle} je spremljena.`);
            setIsSaving(false);
            onClose();
        }, 800);
    };

    const modelOptions = [
        { value: 'gpt-4', label: 'GPT-4 (OpenAI)' },
        { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
        { value: 'claude-3-opus', label: 'Claude 3 Opus (Anthropic)' },
        { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
        { value: 'local-llama-3', label: 'Local Llama 3' },
    ];

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Konfiguracija: ${integrationTitle}`}
            className="max-w-xl"
        >
            <div className="p-6 space-y-4">
                <div>
                    <Label htmlFor="apiUrl">API URL</Label>
                    <Input
                        id="apiUrl"
                        value={apiUrl}
                        onChange={(e) => setApiUrl(e.target.value)}
                        placeholder="https://api.example.com/v1"
                    />
                    <p className="text-xs text-gray-400 mt-1">Ostavite prazno za default URL.</p>
                </div>

                <div>
                    <Label htmlFor="apiKey">API Key</Label>
                    <Input
                        id="apiKey"
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-..."
                    />
                </div>

                <div>
                    <Label htmlFor="model">Model</Label>
                    <Select
                        options={modelOptions}
                        defaultValue={model}
                        onChange={setModel}
                    />
                </div>

                <div className="flex gap-3 pt-4 justify-end">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={isSaving}
                    >
                        Odustani
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={isSaving || !apiKey}
                        className="bg-brand-500 hover:bg-brand-600 text-white"
                    >
                        {isSaving ? 'Spremanje...' : 'Spremi promjene'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
