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

      // Create user profile
      await base44.entities.UserProfile.create(profile);

      // Generate recommendations using AI with hybrid approach
      const stores = await base44.entities.Store.list();
      const storeNames = stores.slice(0, 5).map(s => s.name).join(', ');

      // Check for similar users to incorporate collaborative filtering
      const user = await base44.auth.me();
      const similarUsers = await base44.entities.SimilarUserEdge.filter(
        { user_id: user.email },
        '-similarity',
        3
      ).catch(() => []);

      const prompt = `Generate personalized shopping recommendations for a new user based on their detailed profile. Prioritize practical, actionable advice.\n\nUser Profile:\n- Budget Focus: ${finalAnswers.budget} (monthly target: ₪${profile.monthly_budget || 'not specified'})\n- Dietary Restrictions: ${finalAnswers.restrictions.join(', ')}\n${profile.kashrut_level && profile.kashrut_level !== 'none' ? `- Kashrut Level: ${profile.kashrut_level}\n` : ''}\n${profile.allergen_avoid_list && profile.allergen_avoid_list.length > 0 ? `- Allergies: ${profile.allergen_avoid_list.join(', ')}\n` : ''}\n- Shopping Style: ${finalAnswers.style}\n- Household Size: ${profile.household_size}\n${profile.age_range ? `- Age Range: ${profile.age_range}\n` : ''}\n${profile.user_role ? `- User Role: ${profile.user_role}\n` : ''}\n\nAvailable stores to recommend from: ${storeNames}.\n\nProvide concise, data-driven recommendations in JSON format:\n1. Best store recommendation from the available list, and a specific, compelling reason why it's suitable for this user based on their profile.\n2. Two specific product categories the user should focus on for their shopping, with clear reasons aligning to their preferences.\n3. A brief, encouraging, and helpful overall summary (2-3 sentences) that ties together the recommendations and persona.`;

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
      <div className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
        <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center mb-6 shadow-xl">
          <Sparkles className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Welcome to Smart Cart!</h1>
        <p className="text-gray-600 mb-8 max-w-md">
          Let's personalize your shopping experience. Answer a few quick questions to get customized recommendations.
        </p>
        <Button 
          onClick={() => setStep(0)}
          size="lg"
          className="bg-indigo-600 hover:bg-indigo-700 shadow-lg px-8"
        >
          Get Started <ChevronRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    );
  }

  // Generating recommendations
  if (isGenerating) {
    return (
      <div className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-6" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Creating Your Profile</h2>
        <p className="text-gray-500">Generating personalized recommendations...</p>
      </div>
    );
  }

  // Show recommendations
  if (recommendations) {
    return (
      <div className="fixed inset-0 bg-white z-[100] overflow-y-auto p-6">
        <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl mx-auto py-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Profile is Ready!</h2>
          <p className="text-gray-600">Here are your personalized recommendations</p>
        </div>

        <Card className="border-2 border-indigo-200 bg-indigo-50/50">
          <CardContent className="p-6">
            <div className="flex items-start gap-3 mb-4">
              <ShoppingCart className="w-6 h-6 text-indigo-600 mt-1" />
              <div>
                <h3 className="font-bold text-lg text-gray-900 mb-1">Recommended Store</h3>
                <p className="text-2xl font-bold text-indigo-600 mb-2">{recommendations.store}</p>
                <p className="text-sm text-gray-700">{recommendations.storeReason}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h3 className="font-bold text-gray-900">Focus on These Categories:</h3>
          {recommendations.products.map((product, idx) => (
            <Card key={idx} className="border border-gray-200">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center text-green-600 font-bold">
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{product.category}</h4>
                  <p className="text-sm text-gray-600 mt-1">{product.reason}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200">
          <CardContent className="p-5">
            <p className="text-gray-700 leading-relaxed">{recommendations.summary}</p>
          </CardContent>
        </Card>

        <Button 
          onClick={handleGetStarted}
          size="lg"
          className="w-full bg-indigo-600 hover:bg-indigo-700 shadow-lg"
        >
          Start Shopping <ChevronRight className="w-5 h-5 ml-2" />
        </Button>
        </div>
      </div>
    );
  }

  // Question flow
  const Icon = currentQuestion.icon;
  const progress = ((step + 1) / QUESTIONS.length) * 100;

  return (
    <div className="fixed inset-0 bg-white z-[100] overflow-y-auto p-6">
      <div className="space-y-6 animate-in fade-in duration-300 max-w-lg mx-auto py-8">
      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="text-center">
        <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Icon className="w-6 h-6 text-indigo-600" />
        </div>
        <p className="text-sm text-gray-500 mb-2">
          Question {step + 1} of {QUESTIONS.length}
          {currentQuestion.optional && <span className="text-indigo-600 ml-1">(Optional)</span>}
        </p>
        <h2 className="text-2xl font-bold text-gray-900">{currentQuestion.text}</h2>
      </div>

      <div className="space-y-3">
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
              className={`w-full p-5 border-2 rounded-xl transition-all text-left group active:scale-[0.98] ${
                isSelected 
                  ? 'bg-indigo-600 border-indigo-600' 
                  : isDisabled 
                    ? 'bg-gray-100 border-gray-200 opacity-50 cursor-not-allowed'
                    : 'bg-white border-gray-200 hover:border-indigo-400 hover:bg-indigo-50'
              }`}
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl">{option.emoji}</span>
                <span className={`font-semibold text-lg flex-1 ${
                  isSelected ? 'text-white' : 'text-gray-900 group-hover:text-indigo-700'
                }`}>
                  {option.label}
                </span>
                {isSelected && (
                  <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Show allergen selection if allergies is selected */}
      {currentQuestion.id === 'restrictions' && 
       answers.restrictions && 
       answers.restrictions.includes('allergies') && (
        <Card className="border-2 border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h4 className="font-semibold text-gray-900">Select Your Allergens</h4>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ALLERGEN_OPTIONS.map((allergen) => {
                const isSelected = selectedAllergens.includes(allergen.value);
                return (
                  <button
                    key={allergen.value}
                    onClick={() => toggleAllergen(allergen.value)}
                    className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                      isSelected
                        ? 'bg-amber-600 border-amber-600 text-white'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-amber-400'
                    }`}
                  >
                    {allergen.label}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {currentQuestion.type === 'input' && (
        <div className="space-y-4">
            <Input
                type={currentQuestion.inputType || 'text'}
                placeholder={currentQuestion.placeholder}
                value={answers[currentQuestion.id] || ''}
                onChange={(e) => setAnswers({ ...answers, [currentQuestion.id]: e.target.value })}
                className="h-14 text-lg text-center"
                autoFocus
            />
            <Button
                onClick={handleContinue}
                disabled={!answers[currentQuestion.id]}
                size="lg"
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Continue <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
        </div>
      )}

      {currentQuestion.multiSelect && (
        <Button
          onClick={handleContinue}
          disabled={!answers[currentQuestion.id] || answers[currentQuestion.id].length === 0}
          size="lg"
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue <ChevronRight className="w-5 h-5 ml-2" />
        </Button>
      )}

      {step > 0 && (
        <Button 
          variant="ghost" 
          onClick={() => setStep(step - 1)}
          className="w-full"
        >
          ← Back
        </Button>
      )}
      </div>
    </div>
  );
}