import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Sparkles, ShoppingCart, Heart, Shield, TrendingDown, Loader2 } from 'lucide-react';

const QUESTIONS = [
  {
    id: 'budget',
    text: 'What is your typical monthly shopping budget?',
    icon: TrendingDown,
    options: [
      { value: 'save_money', label: '<$300', emoji: '💰' },
      { value: 'balanced', label: '$300-600', emoji: '⚖️' },
      { value: 'health_focused', label: '>$600', emoji: '🌟' }
    ]
  },
  {
    id: 'health',
    text: 'What are your dietary priorities?',
    icon: Heart,
    options: [
      { value: 'price', label: 'Best Price', emoji: '💵' },
      { value: 'health', label: 'Health Focused', emoji: '🥗' },
      { value: 'balanced', label: 'Balanced', emoji: '⚖️' }
    ]
  },
  {
    id: 'restrictions',
    text: 'Do you have dietary restrictions?',
    icon: Shield,
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
  }
];

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [recommendations, setRecommendations] = useState(null);

  const currentQuestion = QUESTIONS[step];
  const isLastQuestion = step === QUESTIONS.length - 1;

  const handleAnswer = async (value) => {
    const newAnswers = { ...answers, [currentQuestion.id]: value };
    setAnswers(newAnswers);

    if (isLastQuestion) {
      await generateRecommendations(newAnswers);
    } else {
      setStep(step + 1);
    }
  };

  const generateRecommendations = async (finalAnswers) => {
    setIsGenerating(true);
    try {
      // Map answers to profile
      const profile = {
        budget_focus: finalAnswers.budget,
        kashrut_level: finalAnswers.restrictions === 'kosher' ? 'basic_kosher' : 'none',
        allergen_avoid_list: finalAnswers.restrictions === 'allergies' ? ['gluten', 'nuts'] : [],
        shopping_frequency: 'weekly',
        household_size: 1
      };

      // Create user profile
      await base44.entities.UserProfile.create(profile);

      // Generate recommendations using AI
      const stores = await base44.entities.Store.list();
      const storeNames = stores.slice(0, 5).map(s => s.name).join(', ');

      const prompt = `Generate personalized shopping recommendations for a new user with these preferences:
      - Budget: ${finalAnswers.budget}
      - Health Priority: ${finalAnswers.health}
      - Restrictions: ${finalAnswers.restrictions}
      - Shopping Style: ${finalAnswers.style}
      
      Available stores: ${storeNames}
      
      Provide:
      1. Best store recommendation (from the list) and why
      2. Two specific product categories they should focus on
      3. Brief explanation (2-3 sentences)`;

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
  if (step === -1 || step === 0 && Object.keys(answers).length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
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
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-6" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Creating Your Profile</h2>
        <p className="text-gray-500">Generating personalized recommendations...</p>
      </div>
    );
  }

  // Show recommendations
  if (recommendations) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl mx-auto">
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
    );
  }

  // Question flow
  const Icon = currentQuestion.icon;
  const progress = ((step + 1) / QUESTIONS.length) * 100;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-lg mx-auto">
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
        <p className="text-sm text-gray-500 mb-2">Question {step + 1} of {QUESTIONS.length}</p>
        <h2 className="text-2xl font-bold text-gray-900">{currentQuestion.text}</h2>
      </div>

      <div className="space-y-3">
        {currentQuestion.options.map((option) => (
          <button
            key={option.value}
            onClick={() => handleAnswer(option.value)}
            className="w-full p-5 bg-white border-2 border-gray-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left group active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">{option.emoji}</span>
              <span className="font-semibold text-gray-900 group-hover:text-indigo-700 text-lg">
                {option.label}
              </span>
            </div>
          </button>
        ))}
      </div>

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
  );
}