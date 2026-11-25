import React, { useCallback, useEffect, useRef, useState } from "react";
import { get, patch } from "../api/client";
import { useApp } from "../context/AppContext";
import { useNavigate } from "react-router";
import Button from "../components/ui/button/Button";
import PageMeta from "../components/common/PageMeta";
import { useToast } from "../context/ToastContext";
import PageToolbar from "../components/ui/PageToolbar";
import { UserCircleIcon } from "../icons";
import { isUserRole } from "../types/roles";
import { useT } from "../lib/i18n/context";

interface ProfileData {
    id: string;
    org_id?: string;
    role?: string;
    full_name?: string;
    created_at?: string;
}

interface OrganizationData {
    id: string;
    name: string;
    slug: string;
}

export default function Profile() {
    const { t } = useT();
    const { user, loading: authLoading } = useApp();
    const navigate = useNavigate();
    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<"success" | "error" | null>(null);
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [organization, setOrganization] = useState<OrganizationData | null>(null);
    const savingLock = useRef(false);

    // Form states
    const [fullName, setFullName] = useState("");

    const loadErrorTextRef = useRef(t.profile.loadError);
    loadErrorTextRef.current = t.profile.loadError;
    const toastErrorRef = useRef(toast.error);
    toastErrorRef.current = toast.error;

    const fetchProfile = useCallback(async () => {
        try {
            setLoading(true);
            setLoadError(false);
            const { data } = await get<{ profile: ProfileData; organization: OrganizationData | null }>('/me/profile');
            setProfile(data.profile);
            setFullName(data.profile.full_name || "");
            setOrganization(data.organization);
        } catch (err: any) {
            console.error("Error fetching profile:", err);
            setLoadError(true);
            toastErrorRef.current(loadErrorTextRef.current);
        } finally {
            setLoading(false);
        }
    }, []);

    const userId = user?.id;

    useEffect(() => {
        if (!authLoading && !userId) {
            navigate("/auth/signin");
            return;
        }

        if (userId) {
            void fetchProfile();
        }
    }, [userId, authLoading, navigate, fetchProfile]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || loadError || savingLock.current) return;

        savingLock.current = true;
        setSaving(true);
        setSaveStatus(null);
        try {
            await patch('/me/profile', { full_name: fullName });
            setSaveStatus("success");
            toast.success(t.profile.updateSuccess);
            await fetchProfile();
        } catch (err: any) {
            console.error("Error updating profile:", err);
            setSaveStatus("error");
            toast.error(t.profile.updateError);
        } finally {
            savingLock.current = false;
            setSaving(false);
        }
    };

    const roleLabel = isUserRole(profile?.role)
        ? t.profile.roles[profile.role]
        : t.profile.defaultRole;

    if (authLoading || loading) {
        return (
            <div className="flex items-center justify-center p-20">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="p-6 max-w-4xl mx-auto">
                <PageMeta title={`${t.profile.title} | Travline`} description={t.profile.description} />
                <div className="rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
                    <p role="alert" className="mb-4 text-sm text-red-800 dark:text-red-300">
                        {t.profile.loadError}
                    </p>
                    <Button type="button" variant="outline" onClick={() => void fetchProfile()}>
                        {t.profile.retry}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <PageMeta title={`${t.profile.title} | Travline`} description={t.profile.description} />
            <PageToolbar
                title={t.profile.pageTitle}
                description={t.profile.pageDescription}
                searchValue=""
                onSearchChange={() => { }}
                searchPlaceholder=""
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left Column: Basic Info */}
                <div className="md:col-span-1 space-y-6">
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-24 h-24 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center mb-4">
                                <UserCircleIcon className="w-16 h-16 text-brand-500" />
                            </div>
                            <h2 className="text-xl font-bold dark:text-white">
                                {fullName || user?.email?.split("@")[0]}
                            </h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">
                                {roleLabel}
                            </p>
                            <div className="mt-4 w-full pt-4 border-t border-gray-100 dark:border-gray-800 text-left">
                                <div className="text-xs text-gray-400 uppercase font-semibold mb-1">{t.profile.emailAddress}</div>
                                <div className="text-sm dark:text-gray-200 truncate">{user?.email}</div>

                                <div className="text-xs text-gray-400 uppercase font-semibold mt-4 mb-1">{t.profile.userId}</div>
                                <div className="text-xs font-mono text-gray-400 dark:text-gray-500 truncate">{user?.id}</div>
                            </div>
                        </div>
                    </div>

                    {organization && (
                        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                            <h3 className="font-bold mb-4 dark:text-white">{t.profile.orgnization}</h3>
                            <div className="space-y-3">
                                <div>
                                    <div className="text-xs text-gray-400 uppercase font-semibold">{t.profile.organizationName}</div>
                                    <div className="text-sm dark:text-gray-200">{organization.name}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-400 uppercase font-semibold">{t.profile.slug}</div>
                                    <div className="text-sm dark:text-gray-200 font-mono italic">/{organization.slug}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Edit Form */}
                <div className="md:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 shadow-sm">
                        <h3 className="text-lg font-bold mb-6 dark:text-white">{t.profile.personalInfo}</h3>

                        {saveStatus && (
                            <div
                                role={saveStatus === "error" ? "alert" : "status"}
                                className={`mb-4 rounded-lg p-3 text-sm ${saveStatus === "success" ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300"}`}
                            >
                                {saveStatus === "success" ? t.profile.updateSuccess : t.profile.updateError}
                            </div>
                        )}

                        <form onSubmit={handleSave} className="space-y-6">
                            <div>
                                <label htmlFor="profile-full-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    {t.profile.fullName}
                                </label>
                                <input
                                    id="profile-full-name"
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => { setFullName(e.target.value); setSaveStatus(null); }}
                                    disabled={saving}
                                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none dark:text-white"
                                    placeholder={t.profile.fullNamePlaceholder}
                                />
                            </div>

                            <div>
                                <label htmlFor="profile-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 opacity-60">
                                    {t.profile.emailReadOnly}
                                </label>
                                <input
                                    id="profile-email"
                                    type="email"
                                    value={user?.email || ""}
                                    disabled
                                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-sm cursor-not-allowed opacity-60 dark:text-gray-300"
                                />
                                <p className="mt-2 text-xs text-gray-500 italic">{t.profile.emailReadOnlyHint}</p>
                            </div>

                            <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                                <Button
                                    type="submit"
                                    disabled={saving}
                                    className="px-8"
                                >
                                    {saving ? t.profile.saving : t.profile.saveChanges}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
