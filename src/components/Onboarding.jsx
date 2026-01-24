import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Sparkles, ShoppingCart, Heart, Shield, TrendingDown, Loader2, AlertTriangle } from 'lucide-react';

const ALLERGEN_OPTIONS = [
  { value: 'gluten', label: 'Gluten' },
  { value: 'lactose', label: 'Lactose' },
  { value: 'nuts', label: 'Nuts' },
  { value: 'peanuts', label: 'Peanuts' },
  { value: 'soy', label: 'Soy' },
  { value: 'eggs', label: 'Eggs' },
  { value: 'fish', label: 'Fish' },
  { value: 'shellfish', label: 'Shellfish' },
  { value: 'wheat', label: 'Wheat' },
  { value: 'sesame', label: 'Sesame' }
];

const QUESTIONS = [
  {
    id: 'display_name',
    text: 'What should we call you?',
    icon: Heart,
    type: 'input',
    inputType: 'text',
    placeholder: 'Enter your name',
    options: []
  },
  {
    id: 'monthly_budget',
    text: 'What is your target monthly grocery budget (₪)?',
    icon: TrendingDown,
    type: 'input',
    inputType: 'number',
    placeholder: 'e.g. 1500',
    options: [] 
  },
  {
    id: 'budget',
    text: 'What is your main spending priority?',
    icon: TrendingDown,
    options: [
      { value: 'save_money', label: 'Save Money', emoji: '💰' },
      { value: 'balanced', label: 'Balanced', emoji: '⚖️' },
      { value: 'health_focused', label: 'Health Focused', emoji: '🌟' }
    ]
  },

  {
    id: 'restrictions',
    text: 'Do you have dietary restrictions?',
    icon: Shield,
    multiSelect: true,
    options: [
      { value: 'none', label: 'None', emoji: '✅' },
      { value: 'kosher', label: 'Kosher', emoji: '✡️' },
      { value: 'allergies', label: 'Food Allergies', emoji: '⚠️' }
    ]
  },
  {
    id: 'style',
    text: 'What describes your shopping style?',
    icon: ShoppingCart,
    options: [
      { value: 'price_first', label: 'Always Lowest Price', emoji: '🎯' },
      { value: 'brand_loyal', label: 'Brand Loyal', emoji: '⭐' },
      { value: 'balanced', label: 'Flexible & Balanced', emoji: '🔄' }
    ]
  },
  {
    id: 'household',
    text: 'How many people in your household?',
    icon: ShoppingCart,
    options: [
      { value: 1, label: '1+', emoji: '👤' },
      { value: 2, label: '2+', emoji: '👥' },
      { value: 3, label: '3+', emoji: '👨‍👩‍👦' },
      { value: 4, label: '4+', emoji: '👨‍👩‍👧‍👦' },
      { value: 5, label: '5+', emoji: '👨‍👩‍👧‍👧' }
    ]
  },
  {
    id: 'age',
    text: 'What is your age range? (Optional)',
    icon: Heart,
    optional: true,
    options: [
      { value: '18-25', label: '18-25', emoji: '🎓' },
      { value: '26-35', label: '26-35', emoji: '💼' },
      { value: '36-50', label: '36-50', emoji: '👨‍👩‍👧' },
      { value: '51-65', label: '51-65', emoji: '👴' },
      { value: '65+', label: '65+', emoji: '👵' },
      { value: 'skip', label: 'Skip', emoji: '➡️' }
    ]
  },
  {
    id: 'role',
    text: 'What best describes you? (Optional)',
    icon: Heart,
    optional: true,
    options: [
      { value: 'student', label: 'Student', emoji: '📚' },
      { value: 'working', label: 'Working Professional', emoji: '💼' },
      { value: 'parent', label: 'Parent', emoji: '👨‍👩‍👧‍👦' },
      { value: 'retired', label: 'Retired', emoji: '🌴' },
      { value: 'other', label: 'Other', emoji: '✨' },
      { value: 'skip', label: 'Skip', emoji: '➡️' }
    ]
  }
];

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState({});
  const [selectedAllergens, setSelectedAllergens] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [recommendations, setRecommendations] = useState(null);

  const currentQuestion = step >= 0 ? QUESTIONS[step] : null;
  const isLastQuestion = step === QUESTIONS.length - 1;

  const handleAnswer = async (value) => {
    if (currentQuestion.multiSelect) {
      // Handle multi-select
      const currentSelections = answers[currentQuestion.id] || [];
      let newSelections;
      
      if (value === 'none') {
        // If "None" is selected, clear all others
        newSelections = currentSelections.includes('none') ? [] : ['none'];
      } else {
        // If other option selected, remove "None" and toggle the selection
        const withoutNone = currentSelections.filter(v => v !== 'none');
        if (withoutNone.includes(value)) {
          newSelections = withoutNone.filter(v => v !== value);
        } else {
          newSelections = [...withoutNone, value];
        }
      }
      
      setAnswers({ ...answers, [currentQuestion.id]: newSelections });
    } else {
      // Single select - proceed immediately
      const newAnswers = { ...answers, [currentQuestion.id]: value };
      setAnswers(newAnswers);

      if (isLastQuestion) {
        await generateRecommendations(newAnswers);
      } else {
        setStep(step + 1);
      }
    }
  };

  const handleContinue = async () => {
    if (isLastQuestion) {
      await generateRecommendations(answers);
    } else {
      setStep(step + 1);
    }
  };

  const toggleAllergen = (allergen) => {
    if (selectedAllergens.includes(allergen)) {
      setSelectedAllergens(selectedAllergens.filter(a => a !== allergen));
    } else {
      setSelectedAllergens([...selectedAllergens, allergen]);
    }
  };

  const generateRecommendations = async (finalAnswers) => {
    setIsGenerating(true);
    try {
      // Map answers to profile
      const restrictions = Array.isArray(finalAnswers.restrictions) ? finalAnswers.restrictions : [finalAnswers.restrictions];
      const profile = {
        monthly_budget: parseFloat(finalAnswers.monthly_budget) || 0,
        budget_focus: finalAnswers.budget,
        kashrut_level: restrictions.includes('kosher') ? 'basic_kosher' : 'none',
        allergen_avoid_list: restrictions.includes('allergies') ? selectedAllergens : [],
        shopping_frequency: 'weekly',
        household_size: finalAnswers.household || 1,
        age_range: finalAnswers.age && finalAnswers.age !== 'skip' ? finalAnswers.age : null,
        user_role: finalAnswers.role && finalAnswers.role !== 'skip' ? finalAnswers.role : null
      };

      // Update user display name
      if (finalAnswers.display_name) {
        await base44.auth.updateMe({ display_name: finalAnswers.display_name });
      }

      // Create user profile
      await base44.entities.UserProfile.create(profile);

      // Build user vectors after profile creation
      const currentUser = await base44.auth.me();
      if (currentUser?.email) {
          try {
              await base44.functions.invoke('buildUserVectors', { userId: currentUser.email, mode: 'incremental' });
              console.log("User vectors updated after onboarding profile save.");
          } catch (e) {
              console.error("Failed to update user vectors after onboarding:", e);
          }
      }

      // Generate recommendations using AI with hybrid approach including sentiment
      const stores = await base44.entities.Store.list('', 50);

      // Fetch sentiment data for stores
      const sentiments = await base44.entities.StoreSentiment.list('', 1000).catch(() => []);
      const sentimentMap = {};
      sentiments.forEach(s => {
          sentimentMap[s.store_id] = s;
      });

      // Score stores by sentiment + rating
      const scoredStores = stores.map(s => {
          const sentiment = sentimentMap[s.id];
          const sentimentScore = sentiment ? sentiment.sentiment_score : 0;
          const ratingScore = (s.average_rating || 3) / 5;
          const combinedScore = (sentimentScore * 0.4) + (ratingScore * 0.6);
          return { ...s, combinedScore, sentiment };
      }).sort((a, b) => b.combinedScore - a.combinedScore);

      const storeNames = scoredStores.slice(0, 5).map(s => s.name).join(', ');
      const storeInfo = scoredStores.slice(0, 5).map(s => 
          `${s.name} (Sentiment: ${s.sentiment?.overall_sentiment || 'neutral'}, Rating: ${s.average_rating || 'N/A'}/5)`
      ).join('\n');

      const prompt = `You are an AI assistant specialized in personalized shopping recommendations. Your advice should be highly practical and actionable, taking into account the user's explicit preferences (budget, dietary needs, shopping style) and also leveraging insights derived from patterns of similar shoppers through collaborative filtering. Your goal is to provide a comprehensive recommendation package including store suggestions, product categories, and actionable shopping tips.

      User Profile Details:
      - Budget Focus: ${finalAnswers.budget} (monthly target: ₪${profile.monthly_budget || 'not specified'})
      - Dietary Restrictions: ${finalAnswers.restrictions.join(', ')}
      ${profile.kashrut_level && profile.kashrut_level !== 'none' ? `- Kashrut Level: ${profile.kashrut_level}\n` : ''}${profile.allergen_avoid_list && profile.allergen_avoid_list.length > 0 ? `- Allergies: ${profile.allergen_avoid_list.join(', ')}\n` : ''}- Shopping Style: ${finalAnswers.style}
      - Household Size: ${profile.household_size}
      ${profile.age_range ? `- Age Range: ${profile.age_range}\n` : ''}${profile.user_role ? `- User Role: ${profile.user_role}\n` : ''}
      Available Store Information (including sentiment and ratings for context):
      ${storeInfo}

      Task:
      1. Recommend the best store from the 'Available Store Information' list. Provide a specific, compelling reason that explicitly connects the user's profile preferences, store sentiment/ratings, AND potential collaborative filtering insights (i.e., this store is popular among users with similar profiles).
      2. Suggest two specific product categories the user should prioritize for their shopping. Provide clear reasons that align directly with their stated preferences and also highlight how these categories are favored by users with similar profiles.
      3. Write a brief (2-3 sentences), encouraging, and helpful overall summary. This summary should incorporate a concise shopping persona for the user and include one or two actionable shopping tips, informed by both their direct preferences and collaborative filtering.

      Respond ONLY in JSON format.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            store: { type: 'string' },
            storeReason: { type: 'string' },
            products: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: { type: 'string' },
                  reason: { type: 'string' }
                }
              }
            },
            summary: { type: 'string' }
          }
        }
      });

      setRecommendations(result);
    } catch (error) {
      console.error('Failed to generate recommendations', error);
      // Fallback recommendations
      setRecommendations({
        store: 'שופרסל',
        storeReason: 'Great selection and competitive prices',
        products: [
          { category: 'Fresh Produce', reason: 'High quality fruits and vegetables' },
          { category: 'Dairy Products', reason: 'Good variety at reasonable prices' }
        ],
        summary: 'Based on your preferences, we recommend starting with fresh produce and dairy products for the best value and health benefits.'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGetStarted = () => {
    onComplete();
  };

  // Welcome screen
  if (step === -1) {
    return (
      <div className="fixed inset-0 bg-gray-900 z-[100] flex flex-col items-center justify-center p-8 text-center">
        <div className="max-w-sm mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-900/50">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          
          <div className="space-y-3">
            <h1 className="text-3xl font-bold text-gray-100 tracking-tight">Welcome!</h1>
            <p className="text-gray-400 text-base leading-relaxed">
              A few quick questions to personalize your experience
            </p>
          </div>
          
          <div className="pt-4">
            <Button 
              onClick={() => setStep(0)}
              size="lg"
              className="bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all duration-200 px-10 h-12 text-base font-medium rounded-xl"
            >
              Let's Go <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
          </div>
          
          <p className="text-xs text-gray-500 pt-2">Takes about 1 minute</p>
        </div>
      </div>
    );
  }

  // Motivational sentences for loading screen
  const MOTIVATIONAL_SENTENCES = [
    "Even your first receipts help us start finding smart savings for you.",
    "Just a few receipts are enough to start saving smarter.",
    "Receipts lead to smarter insights."
  ];

  // Select random sentence once per session (using useState to keep it stable)
  const [motivationalSentence] = useState(() => 
    MOTIVATIONAL_SENTENCES[Math.floor(Math.random() * MOTIVATIONAL_SENTENCES.length)]
  );

  // Generating recommendations
  if (isGenerating) {
    return (
      <div className="fixed inset-0 bg-gray-900 z-[100] flex flex-col items-center justify-center p-8 text-center">
          <div className="max-w-xs mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-gray-100">Setting things up</h2>
              <p className="text-sm text-gray-400">Creating your personalized profile...</p>
              <p className="text-xs text-gray-500 pt-2 max-w-[250px] mx-auto">{motivationalSentence}</p>
            </div>
          </div>
        </div>
    );
  }

  // Show recommendations
  if (recommendations) {
    return (
      <div className="fixed inset-0 bg-gray-900 z-[100] overflow-y-auto">
          <div className="min-h-full flex flex-col p-6">
            <div className="flex-1 max-w-md mx-auto w-full py-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

              {/* Success Header */}
              <div className="text-center space-y-3">
                <div className="w-14 h-14 bg-green-900/50 rounded-2xl flex items-center justify-center mx-auto">
                  <Sparkles className="w-7 h-7 text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-100">You're all set!</h2>
                  <p className="text-gray-400 text-sm mt-1">Here's what we recommend</p>
                </div>
              </div>

              {/* Store Recommendation */}
              <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-sm p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-indigo-400 uppercase tracking-wide">
                  <ShoppingCart className="w-4 h-4" />
                  Recommended Store
                </div>
                <p className="text-xl font-bold text-gray-100">{recommendations.store}</p>
                <p className="text-sm text-gray-400 leading-relaxed">{recommendations.storeReason}</p>
              </div>

              {/* Categories */}
              <div className="space-y-3">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide px-1">Focus Categories</h3>
                {recommendations.products.map((product, idx) => (
                  <div key={idx} className="bg-gray-800 rounded-xl border border-gray-700 shadow-sm p-4 flex items-start gap-3">
                    <div className="w-7 h-7 bg-gray-700 rounded-lg flex items-center justify-center text-gray-300 font-semibold text-sm flex-shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-100 text-sm">{product.category}</h4>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{product.reason}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="bg-indigo-900/30 rounded-xl p-4 border border-indigo-800">
                <p className="text-sm text-gray-300 leading-relaxed">{recommendations.summary}</p>
              </div>

            {/* CTA */}
            <div className="pt-2">
              <Button 
                onClick={handleGetStarted}
                size="lg"
                className="w-full bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all duration-200 h-12 text-base font-medium rounded-xl"
              >
                Start Shopping <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Question flow
  const Icon = currentQuestion.icon;
  const progress = ((step + 1) / QUESTIONS.length) * 100;

  return (
    <div className="fixed inset-0 bg-gray-900 z-[100] overflow-y-auto">
        <div className="min-h-full flex flex-col p-6">
          <div className="flex-1 max-w-md mx-auto w-full py-6 flex flex-col">

            {/* Progress Section - Fixed at top */}
            <div className="space-y-3 mb-8">
              <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-indigo-500 h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 text-center">
                {step + 1} of {QUESTIONS.length}
                {currentQuestion.optional && <span className="text-gray-500 ml-1">· Optional</span>}
              </p>
            </div>

            {/* Question Header */}
            <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h2 className="text-xl font-semibold text-gray-100 leading-snug px-2">{currentQuestion.text}</h2>
            </div>

          {/* Answer Options */}
          <div className="flex-1 space-y-3 animate-in fade-in duration-300">
            {currentQuestion.options.map((option) => {
              const currentSelections = currentQuestion.multiSelect ? (answers[currentQuestion.id] || []) : null;
              const isSelected = currentQuestion.multiSelect ? currentSelections.includes(option.value) : false;
              const isDisabled = currentQuestion.multiSelect && 
                                currentSelections.includes('none') && 
                                option.value !== 'none';
              
              return (
                <button
                  key={option.value}
                  onClick={() => !isDisabled && handleAnswer(option.value)}
                  disabled={isDisabled}
                  className={`w-full p-4 rounded-xl transition-all duration-200 text-left active:scale-[0.98] ${
                      isSelected 
                        ? 'bg-indigo-600 shadow-md shadow-indigo-900/50' 
                        : isDisabled 
                          ? 'bg-gray-800 opacity-40 cursor-not-allowed'
                          : 'bg-gray-800 border border-gray-700 shadow-sm hover:border-indigo-500 hover:shadow-md'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl flex-shrink-0">{option.emoji}</span>
                    <span className={`font-medium text-base flex-1 ${
                        isSelected ? 'text-white' : 'text-gray-200'
                      }`}>
                      {option.label}
                    </span>
                    {isSelected && (
                      <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Allergen Selection - Subgroup */}
          {currentQuestion.id === 'restrictions' && 
           answers.restrictions && 
           answers.restrictions.includes('allergies') && (
            <div className="mt-6 bg-amber-900/30 rounded-xl p-4 border border-amber-800 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h4 className="text-sm font-medium text-amber-200">Select your allergens</h4>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ALLERGEN_OPTIONS.map((allergen) => {
                  const isSelected = selectedAllergens.includes(allergen.value);
                  return (
                    <button
                      key={allergen.value}
                      onClick={() => toggleAllergen(allergen.value)}
                      className={`px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium ${
                        isSelected
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'bg-gray-800 text-gray-300 border border-gray-700 hover:border-amber-600'
                      }`}
                    >
                      {allergen.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Input Type Question */}
          {currentQuestion.type === 'input' && (
            <div className="mt-4 space-y-4">
              <Input
                type={currentQuestion.inputType || 'text'}
                placeholder={currentQuestion.placeholder}
                value={answers[currentQuestion.id] || ''}
                onChange={(e) => setAnswers({ ...answers, [currentQuestion.id]: e.target.value })}
                className="h-14 text-lg text-center rounded-xl bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500 focus:border-indigo-500 focus:ring-indigo-500"
                autoFocus
              />
            </div>
          )}

          {/* Action Buttons - Fixed at bottom */}
          <div className="mt-8 space-y-3 pt-4">
            {(currentQuestion.type === 'input' || currentQuestion.multiSelect) && (
              <Button
                onClick={handleContinue}
                disabled={currentQuestion.type === 'input' 
                  ? !answers[currentQuestion.id] 
                  : !answers[currentQuestion.id] || answers[currentQuestion.id].length === 0}
                size="lg"
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed h-12 text-base font-medium rounded-xl shadow-md hover:shadow-lg transition-all duration-200"
              >
                Continue <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
            )}

            {step > 0 && (
              <button 
                onClick={() => setStep(step - 1)}
                className="w-full py-3 text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                ← Back
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}