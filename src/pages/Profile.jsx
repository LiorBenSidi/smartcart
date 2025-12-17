import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogOut, UserCircle, Settings, Check } from 'lucide-react';

export default function Profile() {
  const [profile, setProfile] = useState({
    budgetFocus: 'balanced',
    isKosher: false,
    householdSize: 1,
    dietaryRestrictions: [], // simplified for UI prototype
    allergen_avoid_list: []
  });
  const [user, setUser] = useState(null);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
        try {
            const currentUser = await base44.auth.me();
            setUser(currentUser);
            
            if (currentUser) {
                // Try to fetch existing profile
                const existing = await base44.entities.UserProfile.filter({ created_by: currentUser.email });
                if (existing.length > 0) {
                    setProfile(existing[0]);
                }
            }
        } catch (err) {
            console.error("Error loading profile:", err);
        }
    };
    loadProfile();
  }, []);

  const handleSave = async () => {
    // Save or Update logic
    try {
        // Check if profile exists to decide update vs create
        const existing = await base44.entities.UserProfile.filter({ created_by: user.email });
        if (existing.length > 0) {
            await base44.entities.UserProfile.update(existing[0].id, profile);
        } else {
            await base44.entities.UserProfile.create(profile);
        }
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
    } catch(e) {
        console.error("Error saving profile", e);
    }
  };

  return (
    <div className="space-y-8">
      {/* User Header */}
      <div className="flex items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
            <UserCircle className="w-8 h-8" />
        </div>
        <div>
            <h2 className="text-xl font-bold text-gray-900">{user?.full_name || 'User'}</h2>
            <p className="text-sm text-gray-500">{user?.email}</p>
        </div>
      </div>

      {/* Preferences Form */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-400" /> Preferences
        </h3>

        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Budget Focus</Label>
                <Select 
                    value={profile.budgetFocus} 
                    onValueChange={(val) => setProfile({...profile, budgetFocus: val})}
                >
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

            <div className="flex items-center justify-between py-2">
                <div className="space-y-0.5">
                    <Label>Kosher Only</Label>
                    <p className="text-xs text-gray-500">Only suggest kosher products</p>
                </div>
                <Switch 
                    checked={profile.isKosher} 
                    onCheckedChange={(val) => setProfile({...profile, isKosher: val})} 
                />
            </div>

            <div className="space-y-2">
                 <Label>Household Size</Label>
                 <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(num => (
                        <button
                            key={num}
                            onClick={() => setProfile({...profile, householdSize: num})}
                            className={`w-10 h-10 rounded-lg font-bold text-sm transition-colors ${
                                profile.householdSize === num 
                                ? 'bg-indigo-600 text-white shadow-md' 
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                        >
                            {num}+
                        </button>
                    ))}
                 </div>
            </div>

            <div className="space-y-3">
                <Label>Food Allergies</Label>
                <div className="grid grid-cols-2 gap-3">
                    {['gluten', 'lactose', 'nuts', 'peanuts', 'soy', 'eggs', 'fish', 'shellfish', 'wheat', 'sesame'].map(allergen => (
                        <div key={allergen} className="flex items-center space-x-2">
                            <Checkbox 
                                id={allergen}
                                checked={profile.allergen_avoid_list?.includes(allergen)}
                                onCheckedChange={(checked) => {
                                    const current = profile.allergen_avoid_list || [];
                                    if (checked) {
                                        setProfile({...profile, allergen_avoid_list: [...current, allergen]});
                                    } else {
                                        setProfile({...profile, allergen_avoid_list: current.filter(a => a !== allergen)});
                                    }
                                }}
                            />
                            <label
                                htmlFor={allergen}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 capitalize cursor-pointer"
                            >
                                {allergen}
                            </label>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        <Button 
            onClick={handleSave} 
            className={`w-full ${isSaved ? 'bg-green-600 hover:bg-green-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
        >
            {isSaved ? <><Check className="w-4 h-4 mr-2" /> Saved</> : 'Save Preferences'}
        </Button>
      </div>

      <Button 
        variant="outline" 
        className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 border-red-100"
        onClick={async () => {
            await base44.auth.logout(createPageUrl('Landing'));
        }}
      >
        <LogOut className="w-4 h-4 mr-2" /> Log Out
      </Button>
    </div>
  );
}