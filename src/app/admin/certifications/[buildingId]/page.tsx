"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Plus, Trash2, CheckCircle,
  AlertCircle, GripVertical, BookOpen,
} from "lucide-react";

type QuizQuestion = {
  question: string;
  options: string[];
  correct_index: number;
  explanation?: string;
};

type CertContent = {
  key_selling_points: string;
  amenity_notes: string;
  pet_policy_notes: string;
  parking_notes: string;
  pricing_notes: string;
  shadows_required: number;
  quiz_questions: QuizQuestion[];
};

type Building = { id: string; name: string; address: string | null };

const emptyQuestion = (): QuizQuestion => ({
  question: "",
  options: ["", "", "", ""],
  correct_index: 0,
  explanation: "",
});

export default function BuildingCertificationPage() {
  const params = useParams();
  const router = useRouter();
  const buildingId = params.buildingId as string;

  const [building, setBuilding] = useState<Building | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<CertContent>({
    key_selling_points: "",
    amenity_notes: "",
    pet_policy_notes: "",
    parking_notes: "",
    pricing_notes: "",
    shadows_required: 2,
    quiz_questions: [emptyQuestion()],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/certifications/${buildingId}`);
      const data = await res.json();
      if (res.ok) {
        setBuilding(data.building);
        if (data.content) {
          setForm({
            key_selling_points: data.content.key_selling_points || "",
            amenity_notes: data.content.amenity_notes || "",
            pet_policy_notes: data.content.pet_policy_notes || "",
            parking_notes: data.content.parking_notes || "",
            pricing_notes: data.content.pricing_notes || "",
            shadows_required: data.content.shadows_required ?? 2,
            quiz_questions:
              Array.isArray(data.content.quiz_questions) && data.content.quiz_questions.length > 0
                ? data.content.quiz_questions
                : [emptyQuestion()],
          });
        }
      }
    } finally {
      setLoading(false);
    }
  }, [buildingId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    // Validate questions
    for (let i = 0; i < form.quiz_questions.length; i++) {
      const q = form.quiz_questions[i];
      if (!q.question.trim()) {
        setError(`Question ${i + 1} is missing the question text`);
        setSaving(false);
        return;
      }
      const filledOptions = q.options.filter((o) => o.trim());
      if (filledOptions.length < 2) {
        setError(`Question ${i + 1} needs at least 2 answer options`);
        setSaving(false);
        return;
      }
      if (!q.options[q.correct_index]?.trim()) {
        setError(`Question ${i + 1}: the correct answer option is empty`);
        setSaving(false);
        return;
      }
    }

    // Strip empty options from questions, recalculating correct_index
    const cleanedQuestions = form.quiz_questions.map((q) => {
      const correctAnswer = q.options[q.correct_index];
      const filteredOptions = q.options.filter((o) => o.trim());
      const newCorrectIndex = filteredOptions.indexOf(correctAnswer);
      return {
        question: q.question.trim(),
        options: filteredOptions,
        correct_index: newCorrectIndex >= 0 ? newCorrectIndex : 0,
        ...(q.explanation?.trim() ? { explanation: q.explanation.trim() } : {}),
      };
    });

    try {
      const res = await fetch(`/api/admin/certifications/${buildingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, quiz_questions: cleanedQuestions }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  function addQuestion() {
    setForm({ ...form, quiz_questions: [...form.quiz_questions, emptyQuestion()] });
  }

  function removeQuestion(index: number) {
    if (form.quiz_questions.length === 1) return;
    const updated = form.quiz_questions.filter((_, i) => i !== index);
    setForm({ ...form, quiz_questions: updated });
  }

  function updateQuestion(index: number, updated: QuizQuestion) {
    const questions = [...form.quiz_questions];
    questions[index] = updated;
    setForm({ ...form, quiz_questions: questions });
  }

  function updateOption(qIndex: number, optIndex: number, value: string) {
    const questions = [...form.quiz_questions];
    const q = { ...questions[qIndex] };
    const options = [...q.options];
    options[optIndex] = value;
    q.options = options;
    questions[qIndex] = q;
    setForm({ ...form, quiz_questions: questions });
  }

  function addOption(qIndex: number) {
    if (form.quiz_questions[qIndex].options.length >= 6) return;
    const questions = [...form.quiz_questions];
    questions[qIndex] = { ...questions[qIndex], options: [...questions[qIndex].options, ""] };
    setForm({ ...form, quiz_questions: questions });
  }

  function removeOption(qIndex: number, optIndex: number) {
    const q = form.quiz_questions[qIndex];
    if (q.options.length <= 2) return;
    const options = q.options.filter((_, i) => i !== optIndex);
    const newCorrect = q.correct_index >= options.length ? options.length - 1 : q.correct_index;
    updateQuestion(qIndex, { ...q, options, correct_index: newCorrect });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/admin/certifications")} className="-ml-2 mb-3">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Certifications
        </Button>
        <h1 className="text-3xl font-bold">{building?.name || "Building"}</h1>
        {building?.address && (
          <p className="text-muted-foreground">{building.address}</p>
        )}
      </div>

      {/* Shadow Requirement */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Certification Settings</CardTitle>
          <CardDescription>
            How many shadow sessions a Shower must complete before being certified for this building.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label htmlFor="shadows_required" className="whitespace-nowrap">
              Shadow sessions required
            </Label>
            <Input
              id="shadows_required"
              type="number"
              min={0}
              max={10}
              className="w-24"
              value={form.shadows_required}
              onChange={(e) => setForm({ ...form, shadows_required: parseInt(e.target.value) || 0 })}
            />
            <p className="text-sm text-muted-foreground">
              Set to 0 to skip the shadow tier entirely (quiz-only certification)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Study Materials */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Study Materials</CardTitle>
          <CardDescription>
            Showers read this before taking the quiz. Be specific — this is what they will use to represent the building.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="key_selling_points">Key Selling Points</Label>
            <Textarea
              id="key_selling_points"
              placeholder="e.g. Rooftop pool with Biscayne Bay views, 24/7 concierge, valet parking included, walking distance to Brickell City Centre..."
              value={form.key_selling_points}
              onChange={(e) => setForm({ ...form, key_selling_points: e.target.value })}
              rows={4}
              maxLength={2000}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amenity_notes">Amenities</Label>
            <Textarea
              id="amenity_notes"
              placeholder="e.g. Pool on 30th floor (open 7am–10pm), fitness center (24/7), coworking lounge 5th floor, bike storage, EV charging..."
              value={form.amenity_notes}
              onChange={(e) => setForm({ ...form, amenity_notes: e.target.value })}
              rows={3}
              maxLength={2000}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label htmlFor="pricing_notes">Pricing Notes</Label>
              <Textarea
                id="pricing_notes"
                placeholder="e.g. Studios from $2,400/mo, 1BRs from $3,200/mo, 2BRs from $4,500/mo. Ask about move-in specials..."
                value={form.pricing_notes}
                onChange={(e) => setForm({ ...form, pricing_notes: e.target.value })}
                rows={3}
                maxLength={1000}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parking_notes">Parking</Label>
              <Textarea
                id="parking_notes"
                placeholder="e.g. 1 parking space included, additional spaces $150/mo. Valet available for guests..."
                value={form.parking_notes}
                onChange={(e) => setForm({ ...form, parking_notes: e.target.value })}
                rows={3}
                maxLength={1000}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="pet_policy_notes">Pet Policy</Label>
              <Textarea
                id="pet_policy_notes"
                placeholder="e.g. 2 pets max, dogs up to 50lbs allowed, $500 pet deposit, $50/mo pet rent..."
                value={form.pet_policy_notes}
                onChange={(e) => setForm({ ...form, pet_policy_notes: e.target.value })}
                rows={2}
                maxLength={1000}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quiz Questions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Quiz Questions
                <Badge variant="secondary">{form.quiz_questions.length} / 20</Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                Showers must score 70%+ to pass. Minimum 2 questions, maximum 20.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {form.quiz_questions.map((q, qIndex) => (
            <div key={qIndex} className="rounded-lg border p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <GripVertical className="h-4 w-4" />
                  Question {qIndex + 1}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeQuestion(qIndex)}
                  disabled={form.quiz_questions.length === 1}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Question text */}
              <div className="space-y-2">
                <Label className="text-sm">Question</Label>
                <Input
                  placeholder="e.g. What floor is the rooftop pool on?"
                  value={q.question}
                  onChange={(e) => updateQuestion(qIndex, { ...q, question: e.target.value })}
                  maxLength={500}
                />
              </div>

              {/* Answer options */}
              <div className="space-y-2">
                <Label className="text-sm">
                  Answer Options
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Click the radio button to mark the correct answer
                  </span>
                </Label>
                <div className="space-y-2">
                  {q.options.map((opt, optIndex) => (
                    <div key={optIndex} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuestion(qIndex, { ...q, correct_index: optIndex })}
                        className={`h-5 w-5 rounded-full border-2 shrink-0 transition-all ${
                          q.correct_index === optIndex
                            ? "border-green-500 bg-green-500"
                            : "border-muted-foreground/40 hover:border-green-400"
                        }`}
                        title="Mark as correct answer"
                      >
                        {q.correct_index === optIndex && (
                          <div className="h-full w-full flex items-center justify-center">
                            <div className="h-2 w-2 rounded-full bg-white" />
                          </div>
                        )}
                      </button>
                      <Input
                        placeholder={`Option ${optIndex + 1}`}
                        value={opt}
                        onChange={(e) => updateOption(qIndex, optIndex, e.target.value)}
                        maxLength={200}
                        className={q.correct_index === optIndex ? "border-green-300 bg-green-50/50" : ""}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeOption(qIndex, optIndex)}
                        disabled={q.options.length <= 2}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                {q.options.length < 6 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => addOption(qIndex)}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add option
                  </Button>
                )}
              </div>

              {/* Explanation (optional) */}
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">
                  Explanation after answer <span className="font-normal">(optional — shown after quiz)</span>
                </Label>
                <Input
                  placeholder="e.g. The pool is on the 30th floor, accessible via the resident elevator..."
                  value={q.explanation || ""}
                  onChange={(e) => updateQuestion(qIndex, { ...q, explanation: e.target.value })}
                  maxLength={500}
                />
              </div>
            </div>
          ))}

          {form.quiz_questions.length < 20 && (
            <Button type="button" variant="outline" className="w-full" onClick={addQuestion}>
              <Plus className="mr-2 h-4 w-4" />
              Add Question
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Save */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {form.quiz_questions.length} question{form.quiz_questions.length !== 1 ? "s" : ""} ·{" "}
          {form.shadows_required} shadow{form.shadows_required !== 1 ? "s" : ""} required
        </p>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              Saved
            </span>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Certification Content"}
          </Button>
        </div>
      </div>
    </div>
  );
}
