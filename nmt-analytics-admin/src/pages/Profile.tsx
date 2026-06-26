import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../context/AppContext";
import { useNavigate } from "react-router";
import Button from "../components/ui/button/Button";
import { useToast } from "../context/ToastContext";
import PageToolbar from "../components/ui/PageToolbar";
import { UserCircleIcon } from "../icons";
import { ROLE_LABELS, UserRole, isUserRole } from "../types/roles";

function getRoleLabel(role?: string) {
    if (isUserRole(role)) return ROLE_LABELS[role as UserRole];
    return "Korisnik";
}

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
    const { user, loading: authLoading } = useApp();
    const navigate = useNavigate();
    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [organization, setOrganization] = useState<OrganizationData | null>(null);

    // Form states
    const [fullName, setFullName] = useState("");

    useEffect(() => {
        if (!authLoading && !user) {
            navigate("/auth/signin");
            return;
        }

        if (user) {
            fetchProfile();
        }
    }, [user, authLoading, navigate]);

    const fetchProfile = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", user?.id)
                .single();

            if (error) {
                if (error.code === "PGRST116") {
                    // Profile not found, we'll allow creation on save
                    setProfile({ id: user!.id });
                } else {
                    throw error;
                }
            } else {
                setProfile(data);
                setFullName(data.full_name || "");

                if (data.org_id) {
                    fetchOrganization(data.org_id);
                }
            }
        } catch (err: any) {
            console.error("Error fetching profile:", err);
            toast.error("Failed to load profile data");
        } finally {
            setLoading(false);
        }
    };

    const fetchOrganization = async (orgId: string) => {
        try {
            const { data, error } = await supabase
                .from("organizations")
                .select("*")
                .eq("id", orgId)
                .single();

            if (error) throw error;
            setOrganization(data);
        } catch (err: any) {
            console.error("Error fetching organization:", err);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        try {
            setSaving(true);
            const updates = {
                id: user.id,
                full_name: fullName,
                // We preserve org_id and role if they exist
                ...(profile?.org_id ? { org_id: profile.org_id } : {}),
                ...(profile?.role ? { role: profile.role } : {}),
            };

            const { error } = await supabase
                .from("profiles")
                .upsert(updates, { onConflict: "id" });

            if (error) throw error;

            toast.success("Profile updated successfully");
            await fetchProfile();
        } catch (err: any) {
            console.error("Error updating profile:", err);
            toast.error(err.message || "Failed to update profile");
        } finally {
            setSaving(false);
        }
    };

    if (authLoading || loading) {
        return (
            <div className="flex items-center justify-center p-20">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <PageToolbar
                title="Korisnički Profil"
                description="Pregled i uređivanje vaših ličnih podataka"
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
                                {getRoleLabel(profile?.role)}
                            </p>
                            <div className="mt-4 w-full pt-4 border-t border-gray-100 dark:border-gray-800 text-left">
                                <div className="text-xs text-gray-400 uppercase font-semibold mb-1">Email adresa</div>
                                <div className="text-sm dark:text-gray-200 truncate">{user?.email}</div>

                                <div className="text-xs text-gray-400 uppercase font-semibold mt-4 mb-1">User ID</div>
                                <div className="text-xs font-mono text-gray-400 dark:text-gray-500 truncate">{user?.id}</div>
                            </div>
                        </div>
                    </div>

                    {organization && (
                        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                            <h3 className="font-bold mb-4 dark:text-white">Organizacija</h3>
                            <div className="space-y-3">
                                <div>
                                    <div className="text-xs text-gray-400 uppercase font-semibold">Naziv</div>
                                    <div className="text-sm dark:text-gray-200">{organization.name}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-400 uppercase font-semibold">Slug</div>
                                    <div className="text-sm dark:text-gray-200 font-mono italic">/{organization.slug}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Edit Form */}
                <div className="md:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 shadow-sm">
                        <h3 className="text-lg font-bold mb-6 dark:text-white">Lični podaci</h3>

                        <form onSubmit={handleSave} className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Puno ime i prezime
                                </label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none"
                                    placeholder="Unesite vaše ime"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 opacity-60">
                                    Email (Samo za čitanje)
                                </label>
                                <input
                                    type="email"
                                    value={user?.email || ""}
                                    disabled
                                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-sm cursor-not-allowed opacity-60"
                                />
                                <p className="mt-2 text-xs text-gray-500 italic">Email se može promijeniti samo kroz postavke sigurnosti.</p>
                            </div>

                            <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                                <Button
                                    type="submit"
                                    disabled={saving}
                                    className="px-8"
                                >
                                    {saving ? "Spašavanje..." : "Spasi izmjene"}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
