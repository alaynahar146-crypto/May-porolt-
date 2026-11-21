export type CategoryId = "ac" | "car" | "elec" | "appl" | "phone";

export type DangerLevel = "منخفض" | "متوسط" | "مرتفع";

export type PlanId = "basic" | "pro" | "year";

export type TabId = "home" | "result" | "hist" | "plans";

export interface Category {
  id: CategoryId;
  name: string;
  subtitle: string;
  samplePrompts: string[];
}

export interface CostRange {
  min: number;
  max: number;
}

export type CaseStatus = "new" | "in_progress" | "waiting_tech" | "resolved";

export interface ProbableCause {
  cause: string;
  likelihood: "أرجح" | "محتمل";
  check_hint: string;
}

export interface DiagnosisResult {
  diagnosis: string;
  visual_observation?: string;
  confidence_level?: "عالية" | "متوسطة" | "تحتاج فحصاً مباشراً";
  confidence_note?: string;
  probable_causes?: ProbableCause[];
  diy_steps: string[];
  parts_cost_mru: CostRange;
  labor_cost_mru: CostRange;
  technician_phrase: string;
  pro_advice: string;
  danger_level: DangerLevel;
}

export type QuoteVerdict = "عادل" | "مرتفع نسبياً" | "مبالغ فيه" | "منخفض بشكل مريب";

export interface QuoteCheckResult {
  id: number;
  ts: number;
  quotedMru: number;
  claim: string;
  verdict: QuoteVerdict;
  fair_total_mru: CostRange;
  difference_note: string;
  negotiation_script: string;
  warning_signs: string[];
}

export interface FollowUpItem {
  id: number;
  ts: number;
  question: string;
  answer: string;
  next_action: string;
  suggested_followups?: string[];
}

export interface HistoryEntry {
  id: number;
  ts: number;
  cat: CategoryId;
  text: string;
  hasImage?: boolean;
  hasAudio?: boolean;
  res: DiagnosisResult;
  quoteChecks?: QuoteCheckResult[];
  followUps?: FollowUpItem[];
  status?: CaseStatus;
  completedSteps?: number[];
  actualPaidMru?: number;
}

export interface ActivePlan {
  id: PlanId;
  exp: number;
  token?: string;
}

export interface AppState {
  welcomed: boolean;
  used: number;
  plan: ActivePlan | null;
  hist: HistoryEntry[];
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceMru: number;
  days: number;
  subtitle: string;
  perDayText: string;
  matrix: boolean[];
  popularLabel?: string;
  best?: boolean;
  saveNote?: string;
}

export interface MediaImage {
  mime: string;
  data: string;
  previewUrl: string;
}

export interface MediaAudio {
  mime: string;
  data: string;
  playbackUrl: string;
}

export interface CustomCodeRecord {
  code: string;
  planId: PlanId;
  singleUse: boolean;
  usedCount: number;
  createdAt: number;
}

export interface SubscriptionRequestRecord {
  id: string;
  deviceId: number;
  planId: PlanId;
  planName: string;
  priceMru: number;
  activationCode: string;
  status: "pending" | "sent";
  createdAt: number;
}
