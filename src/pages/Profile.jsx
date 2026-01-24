import React, { useState, useEffect, useContext } from 'react';
import { ThemeContext } from '../Layout';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogOut, UserCircle, Settings, Check, RefreshCw, Camera, Loader2, Moon, Sun, MessageSquarePlus, ThumbsUp, ThumbsDown, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import Onboarding from '../components/Onboarding';

export default function Profile() {
  const [profile, setProfile] = useState({
    monthly_budget: '',
    budget_focus: 'balanced',
    kashrut_level: 'none',
    household_size: 1,
    age_range: '',
    user_role: '',
    allergen_avoid_list: [],
    profile_picture: '',
    display_name: ''
  });
  const [user, setUser] = useState(null);
  const [fullName, setFullName] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { darkMode, setDarkMode } = useContext(ThemeContext) || {};
  const [preferences, setPreferences] = useState([]);
  const [tipFeedback, setTipFeedback] = useState({ liked: [], disliked: [] });

  const loadProfile = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setFullName(currentUser?.full_name || '');

      if (currentUser) {
        const existing = await base44.entities.UserProfile.filter({ created_by: currentUser.email });
        if (existing.length > 0) {
          // Initialize profile with existing data AND the display_name from the User entity
          setProfile({
              ...existing[0],
              display_name: currentUser.display_name || ''
          });
        } else {
          // No profile yet, but might have display_name
          setProfile(prev => ({
              ...prev,
              display_name: currentUser.display_name || ''
          }));
        }

        // Load preferences
        const prefs = await base44.entities.UserProductPreference.list();
        setPreferences(prefs);

        // Load tip feedback
        const feedback = await base44.entities.SmartTipFeedback.filter({ created_by: currentUser.email });
        const liked = feedback.filter(f => f.action === 'like');
        const disliked = feedback.filter(f => f.action === 'dislike');
        setTipFeedback({ liked, disliked });
      }
    } catch (err) {
      console.error("Error loading profile:", err);
    }
  };

  const handleRemovePreference = async (id) => {
    try {
        await base44.entities.UserProductPreference.delete(id);
        setPreferences(preferences.filter(p => p.id !== id));
        
        // Update user vectors incrementally
        if (user?.email) {
            base44.functions.invoke('buildUserVectors', { userId: user.email, mode: 'incremental' })
                .then(() => console.log("User vectors updated"))
                .catch(e => console.error("Failed to update user vectors", e));
        }
    } catch (error) {
        console.error("Failed to remove preference", error);
    }
  };

  const handleRemoveTipFeedback = async (id, action) => {
    try {
        await base44.entities.SmartTipFeedback.delete(id);
        if (action === 'like') {
            setTipFeedback(prev => ({ ...prev, liked: prev.liked.filter(t => t.id !== id) }));
        } else {
            setTipFeedback(prev => ({ ...prev, disliked: prev.disliked.filter(t => t.id !== id) }));
        }
        
        // Update user vectors incrementally
        if (user?.email) {
            base44.functions.invoke('buildUserVectors', { userId: user.email, mode: 'incremental' })
                .then(() => console.log("User vectors updated"))
                .catch(e => console.error("Failed to update user vectors", e));
        }
    } catch (error) {
        console.error("Failed to remove tip feedback", error);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleSave = async () => {
    // Save or Update logic
    try {
      // Update user name if changed (built-in)
      if (user && fullName !== user.full_name) {
        await base44.auth.updateMe({ full_name: fullName });
        setUser({ ...user, full_name: fullName });
      }
      
      // We also update the User entity custom attribute 'display_name' separately if needed,
      // but usually we just want to update the UserProfile entity we created.
      // Wait, I added display_name to the 'User' entity in the previous step, BUT
      // I cannot update the 'User' entity directly via entities.User.update usually for built-in users except via auth.updateMe 
      // AND auth.updateMe only accepts specific fields usually.
      // Actually, the instruction said: "You can define additional attributes on the user entity... In that case - you don't need to specify the built-in attributes...".
      // And "You cannot include any of the built-in attributes when editing entities/User.json".
      // So if I added 'display_name' to User.json, it is an extension of the User entity.
      // To update it, I should use base44.auth.updateMe({ display_name: ... }) ? 
      // OR base44.entities.User.update(user.id, { display_name: ... }) ?
      // The instructions say "You can define additional attributes on the user entity...". 
      // Usually custom attributes on User entity are updated via base44.auth.updateMe(data)
      // "to save additional data on the current user, you can use the base44.auth.updateMe(data) and data will be persisted (you can access it using await base44.auth.me())."
      
      if (profile.display_name) {
          await base44.auth.updateMe({ display_name: profile.display_name });
      }

      // Check if profile exists to decide update vs create
      const existing = await base44.entities.UserProfile.filter({ created_by: user.email });
      if (existing.length > 0) {
        await base44.entities.UserProfile.update(existing[0].id, profile);
      } else {
        await base44.entities.UserProfile.create(profile);
      }
      
      // Update user vectors incrementally since profile data affects vectors
      if (user?.email) {
        try {
          await base44.functions.invoke('buildUserVectors', { userId: user.email, mode: 'incremental' });
          console.log("User vectors updated after profile save");
        } catch (e) {
          console.error("Failed to update user vectors", e);
        }
      }
      
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
      // Force reload to update header instantly if needed, or rely on react state if layout was listening (Layout listens to user/profile on mount, might need refresh)
      window.location.reload();
    } catch (e) {
      console.error("Error saving profile", e);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      if (result && result.file_url) {
        setProfile((prev) => ({ ...prev, profile_picture: result.file_url }));
      }
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setIsUploading(false);
    }
  };

  if (showOnboarding) {
    return <Onboarding onComplete={() => {
      setShowOnboarding(false);
      loadProfile();
    }} />;
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-8">
      
      {/* Section 1: Identity & Account */}
      <section className="relative overflow-hidden rounded-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-800/80 to-gray-900/90 backdrop-blur-xl" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
        <div className="relative p-6 border border-gray-700/30 rounded-2xl">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">Account</h2>
          
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="relative group shrink-0">
              <div className="w-20 h-20 bg-gray-700/50 rounded-full flex items-center justify-center text-gray-400 overflow-hidden ring-2 ring-gray-600/50">
                {profile.profile_picture ? (
                  <img src={profile.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <UserCircle className="w-10 h-10" />
                )}
                {isUploading && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-full">
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  </div>
                )}
              </div>
              <label className="absolute -bottom-1 -right-1 bg-indigo-600 text-white p-1.5 rounded-full cursor-pointer shadow-lg hover:bg-indigo-500 transition-all">
                <Camera className="w-3.5 h-3.5" />
                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploading} />
              </label>
            </div>
            
            {/* Name & Email */}
            <div className="flex-1 space-y-3 min-w-0">
              <div>
                <Label htmlFor="displayName" className="text-xs text-gray-500 mb-1 block">Display Name</Label>
                <Input
                  id="displayName"
                  value={profile.display_name || ''}
                  onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                  className="bg-gray-800/50 border-gray-700/50 h-9 text-sm"
                  placeholder="Enter a display name"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Email</Label>
                <div className="text-sm text-gray-400 px-3 py-2 bg-gray-800/30 rounded-lg border border-gray-700/30 truncate">
                  {user?.email}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Smart Feedback (de-emphasized) */}
      <section className="relative overflow-hidden rounded-2xl opacity-90">
        <div className="absolute inset-0 bg-gray-800/40 backdrop-blur-sm" />
        <div className="relative p-5 border border-gray-700/20 rounded-2xl">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Smart Feedback</h2>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Liked Tips */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium flex items-center gap-1.5 text-green-500/80">
                <ThumbsUp className="w-3 h-3" /> Liked Tips
              </h3>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {tipFeedback.liked.length === 0 ? (
                  <p className="text-[11px] text-gray-600 italic py-2">None yet</p>
                ) : (
                  tipFeedback.liked.map(tip => (
                    <div key={tip.id} className="p-2 bg-green-900/10 border border-green-800/20 rounded-lg group relative">
                      <button 
                        onClick={() => handleRemoveTipFeedback(tip.id, 'like')} 
                        className="absolute top-1.5 right-1.5 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <p className="text-xs text-gray-400 pr-5 line-clamp-2">{tip.full_message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Disliked Tips */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium flex items-center gap-1.5 text-red-500/80">
                <ThumbsDown className="w-3 h-3" /> Disliked Tips
              </h3>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {tipFeedback.disliked.length === 0 ? (
                  <p className="text-[11px] text-gray-600 italic py-2">None yet</p>
                ) : (
                  tipFeedback.disliked.map(tip => (
                    <div key={tip.id} className="p-2 bg-red-900/10 border border-red-800/20 rounded-lg group relative">
                      <button 
                        onClick={() => handleRemoveTipFeedback(tip.id, 'dislike')} 
                        className="absolute top-1.5 right-1.5 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <p className="text-xs text-gray-400 pr-5 line-clamp-2">{tip.full_message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Liked Products */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium flex items-center gap-1.5 text-green-500/80">
                <ThumbsUp className="w-3 h-3" /> Liked Products
              </h3>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {preferences.filter(p => p.preference === 'like').length === 0 ? (
                  <p className="text-[11px] text-gray-600 italic py-2">None yet</p>
                ) : (
                  preferences.filter(p => p.preference === 'like').map(p => (
                    <div key={p.id} className="flex justify-between items-center p-2 bg-green-900/10 border border-green-800/20 rounded-lg group">
                      <span className="text-xs text-gray-400 truncate mr-2" title={p.product_name}>{p.product_name}</span>
                      <button onClick={() => handleRemovePreference(p.id)} className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Disliked Products */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium flex items-center gap-1.5 text-red-500/80">
                <ThumbsDown className="w-3 h-3" /> Disliked Products
              </h3>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {preferences.filter(p => p.preference === 'dislike').length === 0 ? (
                  <p className="text-[11px] text-gray-600 italic py-2">None yet</p>
                ) : (
                  preferences.filter(p => p.preference === 'dislike').map(p => (
                    <div key={p.id} className="flex justify-between items-center p-2 bg-red-900/10 border border-red-800/20 rounded-lg group">
                      <span className="text-xs text-gray-400 truncate mr-2" title={p.product_name}>{p.product_name}</span>
                      <button onClick={() => handleRemovePreference(p.id)} className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Preferences (Main Area) */}
      <section className="relative overflow-hidden rounded-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-800/80 to-gray-900/90 backdrop-blur-xl" />
        <div className="relative p-6 border border-gray-700/30 rounded-2xl">
          <div className="flex items-center gap-2 mb-6">
            <Settings className="w-4 h-4 text-gray-500" />
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Preferences</h2>
          </div>

          <div className="space-y-8">
            {/* Budget & Focus Group */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-300 border-b border-gray-700/50 pb-2">Budget & Focus</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Monthly Budget (₪)</Label>
                  <Input
                    type="number"
                    value={profile.monthly_budget || ''}
                    onChange={(e) => setProfile({ ...profile, monthly_budget: parseFloat(e.target.value) })}
                    placeholder="Enter amount"
                    className="bg-gray-800/50 border-gray-700/50 h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Budget Focus</Label>
                  <Select value={profile.budget_focus} onValueChange={(val) => setProfile({ ...profile, budget_focus: val })}>
                    <SelectTrigger className="bg-gray-800/50 border-gray-700/50 h-9 text-sm">
                      <SelectValue placeholder="Select focus" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="save_money">Save Money (Aggressive)</SelectItem>
                      <SelectItem value="balanced">Balanced</SelectItem>
                      <SelectItem value="health_focused">Health Focused</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Household & Demographics Group */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-300 border-b border-gray-700/50 pb-2">Household & Demographics</h3>
              
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Household Size</Label>
                <div className="inline-flex bg-gray-800/50 rounded-lg p-1 border border-gray-700/50">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button
                      key={num}
                      onClick={() => setProfile({ ...profile, household_size: num })}
                      className={`w-10 h-8 rounded-md font-medium text-sm transition-all ${
                        profile.household_size === num
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/50'
                      }`}
                    >
                      {num}+
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Age Range</Label>
                  <Select value={profile.age_range || ''} onValueChange={(val) => setProfile({ ...profile, age_range: val })}>
                    <SelectTrigger className="bg-gray-800/50 border-gray-700/50 h-9 text-sm">
                      <SelectValue placeholder="Select age range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="18-25">18-25</SelectItem>
                      <SelectItem value="26-35">26-35</SelectItem>
                      <SelectItem value="36-50">36-50</SelectItem>
                      <SelectItem value="51-65">51-65</SelectItem>
                      <SelectItem value="65+">65+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Role</Label>
                  <Select value={profile.user_role || ''} onValueChange={(val) => setProfile({ ...profile, user_role: val })}>
                    <SelectTrigger className="bg-gray-800/50 border-gray-700/50 h-9 text-sm">
                      <SelectValue placeholder="What best describes you?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">Student</SelectItem>
                      <SelectItem value="working">Working Professional</SelectItem>
                      <SelectItem value="parent">Parent</SelectItem>
                      <SelectItem value="retired">Retired</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Dietary & Restrictions Group */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-300 border-b border-gray-700/50 pb-2">Dietary & Restrictions</h3>
              
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Kosher Level</Label>
                <Select value={profile.kashrut_level} onValueChange={(val) => setProfile({ ...profile, kashrut_level: val })}>
                  <SelectTrigger className="bg-gray-800/50 border-gray-700/50 h-9 text-sm max-w-xs">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="basic_kosher">Basic Kosher</SelectItem>
                    <SelectItem value="strict_kosher">Strict Kosher</SelectItem>
                    <SelectItem value="glatt_kosher">Glatt Kosher</SelectItem>
                    <SelectItem value="mehadrin">Mehadrin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-gray-500">Food Allergies</Label>
                <div className="grid grid-cols-5 gap-2">
                  {['gluten', 'lactose', 'nuts', 'peanuts', 'soy', 'eggs', 'fish', 'shellfish', 'wheat', 'sesame'].map((allergen) => (
                    <div key={allergen} className="flex items-center space-x-1.5">
                      <Checkbox
                        id={allergen}
                        checked={profile.allergen_avoid_list?.includes(allergen)}
                        onCheckedChange={(checked) => {
                          const current = profile.allergen_avoid_list || [];
                          if (checked) {
                            setProfile({ ...profile, allergen_avoid_list: [...current, allergen] });
                          } else {
                            setProfile({ ...profile, allergen_avoid_list: current.filter((a) => a !== allergen) });
                          }
                        }}
                        className="h-4 w-4"
                      />
                      <label
                        htmlFor={allergen}
                        className="text-xs text-gray-400 capitalize cursor-pointer leading-none"
                      >
                        {allergen}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="mt-8 pt-6 border-t border-gray-700/30">
            <Button
              onClick={handleSave}
              className={`w-full h-11 text-sm font-medium ${
                isSaved 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-indigo-600 hover:bg-indigo-500'
              }`}
            >
              {isSaved ? <><Check className="w-4 h-4 mr-2" /> Saved</> : 'Save Preferences'}
            </Button>
          </div>
        </div>
      </section>

      {/* Section 4: Actions (Secondary / Destructive) */}
      <section className="relative overflow-hidden rounded-2xl">
        <div className="absolute inset-0 bg-gray-800/30 backdrop-blur-sm" />
        <div className="relative p-5 border border-gray-700/20 rounded-2xl space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Actions</h2>
          
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-10 text-sm border-gray-700/50 bg-gray-800/30 hover:bg-gray-700/50 text-gray-400"
              onClick={() => setShowOnboarding(true)}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-2" /> Retake Onboarding
            </Button>

            <Link to={createPageUrl('Feedback')} className="block">
              <Button variant="outline" className="w-full h-10 text-sm border-indigo-800/50 bg-indigo-900/20 hover:bg-indigo-900/40 text-indigo-400">
                <MessageSquarePlus className="w-3.5 h-3.5 mr-2" /> Send Feedback
              </Button>
            </Link>
          </div>

          <Button
            variant="outline"
            className="w-full h-10 text-sm border-red-900/50 bg-red-900/10 hover:bg-red-900/30 text-red-400 hover:text-red-300 mt-2"
            onClick={async () => {
              await base44.auth.logout(createPageUrl('Landing'));
            }}
          >
            <LogOut className="w-3.5 h-3.5 mr-2" /> Log Out
          </Button>
        </div>
      </section>
    </div>);

}