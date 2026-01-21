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
    <div className="space-y-8">
      {/* User Header */}
      <div className="bg-white px-6 py-3 rounded-2xl flex flex-col md:flex-row items-start md:items-center gap-6 dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="relative group">
            <div className="w-24 h-24 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-300 overflow-hidden border-2 border-indigo-50 dark:border-indigo-800">
                {profile.profile_picture ?
            <img src={profile.profile_picture} alt="Profile" className="w-full h-full object-cover" /> :

            <UserCircle className="w-12 h-12" />
            }
                {isUploading &&
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
            }
            </div>
            <label className="absolute bottom-0 right-0 bg-indigo-600 text-white p-2 rounded-full cursor-pointer shadow-lg hover:bg-indigo-700 transition-all hover:scale-105">
                <Camera className="w-4 h-4" />
                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploading} />
            </label>
        </div>
        
        <div className="flex-1 space-y-3 w-full">
            <div>
                <Label htmlFor="fullName">Full Name</Label>
                <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="max-w-md"
              placeholder="Enter your full name" />
            </div>

            <div>
                <Label htmlFor="displayName">Display Name (App Nickname)</Label>
                <Input
              id="displayName"
              value={profile.display_name || ''}
              onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
              className="max-w-md"
              placeholder="Enter a display name" />
            </div>
            <div className="space-y-1">
                <Label>Email</Label>
                <div className="text-sm text-gray-500 dark:text-gray-400 font-medium px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-600 max-w-md truncate">
                    {user?.email}
                </div>
            </div>
        </div>
      </div>

      {/* Smart Tips Feedback */}
      <div className="bg-white p-6 rounded-2xl dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
            <ThumbsUp className="w-4 h-4 text-gray-400 dark:text-gray-500" /> Smart Tips Feedback
        </h3>
        <div className="grid md:grid-cols-2 gap-6 mb-6">
            {/* Liked Tips */}
            <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-green-600 dark:text-green-400">
                    <ThumbsUp className="w-3 h-3" /> Liked Tips
                </h4>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {tipFeedback.liked.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No liked tips yet</p>
                    ) : (
                        tipFeedback.liked.map(tip => (
                            <div key={tip.id} className="p-3 bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 rounded-lg group relative">
                                <button 
                                    onClick={() => handleRemoveTipFeedback(tip.id, 'like')} 
                                    className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                                <div className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase mb-1">
                                    {tip.tip_type?.replace('_', ' ')}
                                </div>
                                <p className="text-sm text-gray-700 dark:text-gray-300 pr-6">{tip.full_message}</p>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Disliked Tips */}
            <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
                    <ThumbsDown className="w-3 h-3" /> Disliked Tips
                </h4>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {tipFeedback.disliked.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No disliked tips yet</p>
                    ) : (
                        tipFeedback.disliked.map(tip => (
                            <div key={tip.id} className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg group relative">
                                <button 
                                    onClick={() => handleRemoveTipFeedback(tip.id, 'dislike')} 
                                    className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                                <div className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase mb-1">
                                    {tip.tip_type?.replace('_', ' ')}
                                </div>
                                <p className="text-sm text-gray-700 dark:text-gray-300 pr-6">{tip.full_message}</p>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
      </div>

      {/* Product Preferences */}
      <div className="bg-white p-6 rounded-2xl dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
            <ThumbsUp className="w-4 h-4 text-gray-400 dark:text-gray-500" /> Product Preferences
        </h3>
        <div className="grid md:grid-cols-2 gap-6">
            {/* Liked Items */}
            <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-green-600 dark:text-green-400">
                    <ThumbsUp className="w-3 h-3" /> Liked Items
                </h4>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {preferences.filter(p => p.preference === 'like').length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No liked items yet</p>
                    ) : (
                        preferences.filter(p => p.preference === 'like').map(p => (
                            <div key={p.id} className="flex justify-between items-center p-2 bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 rounded-lg group">
                                <span className="text-sm text-gray-700 dark:text-gray-300 truncate mr-2" title={p.product_name}>{p.product_name}</span>
                                <button onClick={() => handleRemovePreference(p.id)} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Disliked Items */}
            <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
                    <ThumbsDown className="w-3 h-3" /> Disliked Items
                </h4>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {preferences.filter(p => p.preference === 'dislike').length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No disliked items yet</p>
                    ) : (
                        preferences.filter(p => p.preference === 'dislike').map(p => (
                            <div key={p.id} className="flex justify-between items-center p-2 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg group">
                                <span className="text-sm text-gray-700 dark:text-gray-300 truncate mr-2" title={p.product_name}>{p.product_name}</span>
                                <button onClick={() => handleRemovePreference(p.id)} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
      </div>

      {/* Preferences Form */}
      <div className="bg-white pr-6 pb-3 pl-6 rounded-2xl dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-400 dark:text-gray-500" /> Preferences
        </h3>

        <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                    {darkMode ? <Moon className="w-4 h-4 text-indigo-500 dark:text-indigo-400" /> : <Sun className="w-4 h-4 text-orange-500" />}
                    <Label htmlFor="dark-mode" className="cursor-pointer font-medium text-gray-700 dark:text-gray-200">Dark Mode</Label>
                </div>
                <Switch
              id="dark-mode"
              checked={darkMode}
              onCheckedChange={setDarkMode} />

            </div>

            <div className="space-y-2">
                <Label>Monthly Budget (₪)</Label>
                <Input
                    type="number"
                    value={profile.monthly_budget || ''}
                    onChange={(e) => setProfile({ ...profile, monthly_budget: parseFloat(e.target.value) })}
                    placeholder="Enter amount"
                />
            </div>

            <div className="space-y-2">
                <Label>Budget Focus</Label>
                <Select
              value={profile.budget_focus}
              onValueChange={(val) => setProfile({ ...profile, budget_focus: val })}>

                    <SelectTrigger>
                        <SelectValue placeholder="Select focus" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="save_money">Save Money (Aggressive)</SelectItem>
                        <SelectItem value="balanced">Balanced</SelectItem>
                        <SelectItem value="health_focused">Health Focused</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label>Kosher Level</Label>
                <Select
              value={profile.kashrut_level}
              onValueChange={(val) => setProfile({ ...profile, kashrut_level: val })}>

                    <SelectTrigger>
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
                 <Label>Household Size</Label>
                 <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((num) =>
              <button
                key={num}
                onClick={() => setProfile({ ...profile, household_size: num })}
                className={`w-10 h-10 rounded-lg font-bold text-sm transition-colors ${
                profile.household_size === num ?
                'bg-indigo-600 text-white shadow-md' :
                'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`
                }>

                            {num}+
                        </button>
              )}
                 </div>
            </div>

            <div className="space-y-2">
                <Label>Age Range (Optional)</Label>
                <Select
              value={profile.age_range || ''}
              onValueChange={(val) => setProfile({ ...profile, age_range: val })}>

                    <SelectTrigger>
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

            <div className="space-y-2">
                <Label>Role (Optional)</Label>
                <Select
              value={profile.user_role || ''}
              onValueChange={(val) => setProfile({ ...profile, user_role: val })}>

                    <SelectTrigger>
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

            <div className="space-y-3">
                <Label>Food Allergies</Label>
                <div className="grid grid-cols-2 gap-3">
                    {['gluten', 'lactose', 'nuts', 'peanuts', 'soy', 'eggs', 'fish', 'shellfish', 'wheat', 'sesame'].map((allergen) =>
              <div key={allergen} className="flex items-center space-x-2">
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
                  }} />

                            <label
                  htmlFor={allergen}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 capitalize cursor-pointer">

                                {allergen}
                            </label>
                        </div>
              )}
                </div>
            </div>
        </div>

        <Button
          onClick={handleSave}
          className={`w-full ${isSaved ? 'bg-green-600 hover:bg-green-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>

            {isSaved ? <><Check className="w-4 h-4 mr-2" /> Saved</> : 'Save Preferences'}
        </Button>
      </div>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => setShowOnboarding(true)}>

        <RefreshCw className="w-4 h-4 mr-2" /> Retake Onboarding
      </Button>

      <Link to={createPageUrl('Feedback')} className="block w-full">
        <Button variant="outline" className="w-full text-indigo-600 border-indigo-200 hover:bg-indigo-50">
            <MessageSquarePlus className="w-4 h-4 mr-2" /> Send Feedback
        </Button>
      </Link>

      <Button
        variant="outline"
        className="w-full text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-100 dark:border-red-900/50"
        onClick={async () => {
          await base44.auth.logout(createPageUrl('Landing'));
        }}>

        <LogOut className="w-4 h-4 mr-2" /> Log Out
      </Button>
    </div>);

}