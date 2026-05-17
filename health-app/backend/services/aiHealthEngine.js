const REQUIRED_TOP_LEVEL = ["patientId", "vitals", "history"];
const MIN_GLUCOSE_POINTS = 4;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const avg = (arr) => {
  if (!arr.length) return 0;
  return arr.reduce((sum, n) => sum + n, 0) / arr.length;
};

const stdDev = (arr) => {
  if (arr.length < 2) return 0;
  const mean = avg(arr);
  const variance = avg(arr.map((n) => (n - mean) ** 2));
  return Math.sqrt(variance);
};

const trendLabel = (delta) => {
  if (delta > 8) return "Increasing";
  if (delta < -8) return "Decreasing";
  return "Stable";
};

const round2 = (num) => Math.round(num * 100) / 100;

function validatePayload(payload) {
  const missingFields = REQUIRED_TOP_LEVEL.filter((key) => !payload?.[key]);
  if (missingFields.length) {
    return {
      valid: false,
      reason: `Missing required fields: ${missingFields.join(", ")}`,
    };
  }

  const glucoseReadings = payload?.history?.glucoseReadings || [];
  if (!Array.isArray(glucoseReadings) || glucoseReadings.length < MIN_GLUCOSE_POINTS) {
    return {
      valid: false,
      reason: "Insufficient glucose history for safe prediction",
    };
  }

  const containsInvalid = glucoseReadings.some(
    (g) => g?.value == null || Number.isNaN(Number(g.value)) || Number(g.value) <= 0,
  );
  if (containsInvalid) {
    return {
      valid: false,
      reason: "Invalid glucose reading detected",
    };
  }

  const bpReadings = payload?.history?.bpReadings || [];
  if (!Array.isArray(bpReadings) || bpReadings.length < 3) {
    return {
      valid: false,
      reason: "Insufficient blood pressure history for risk classification",
    };
  }

  return { valid: true };
}

function computeGlucosePrediction(payload) {
  const readings = payload.history.glucoseReadings.slice(-24);
  const glucoseSeries = readings.map((r) => Number(r.value));
  const recent = glucoseSeries.slice(-8);
  const latest = recent[recent.length - 1];
  const baseline = avg(recent);
  const volatility = stdDev(recent);

  const mealEvents = payload.history.meals || [];
  const insulinEvents = payload.history.insulin || [];
  const meds = payload.history.medications || [];

  const recentMealLoad = mealEvents
    .slice(-3)
    .reduce((sum, m) => sum + (Number(m?.carbs || 0) / 15) * 1.8, 0);
  const recentInsulinOffset = insulinEvents
    .slice(-3)
    .reduce((sum, i) => sum + Number(i?.units || 0) * 2.6, 0);
  const medSupport = meds.some((m) => String(m?.adherence).toLowerCase() === "good") ? -1.2 : 0;
  const trendPerStep =
    recent.length >= 2
      ? clamp((recent[recent.length - 1] - recent[0]) / (recent.length - 1), -8, 8)
      : 0;

  // Lightweight LSTM-style autoregressive simulation for next 6 points (4h each = 24h).
  const horizon = 6;
  const predictions = [];
  let previous = latest;
  for (let t = 1; t <= horizon; t += 1) {
    const reversion = (baseline - previous) * 0.22;
    const mealImpact = recentMealLoad * Math.exp(-0.9 * t);
    const insulinImpact = recentInsulinOffset * Math.exp(-1.1 * t);
    const circadian = t <= 2 ? 1.6 : -1.2;
    let next = previous + trendPerStep * 0.45 + reversion + mealImpact - insulinImpact + circadian + medSupport;

    // Guardrail: avoid unrealistic sudden jumps between adjacent forecast points.
    const maxStepJump = clamp(18 - volatility * 0.1, 8, 18);
    const stepDelta = next - previous;
    if (Math.abs(stepDelta) > maxStepJump) {
      next = previous + Math.sign(stepDelta) * maxStepJump;
    }

    // Keep forecast inside realistic short-term physiological bounds.
    next = clamp(next, 65, 260);
    predictions.push({
      hour: t * 4,
      glucose: round2(next),
    });
    previous = next;
  }

  const delta = predictions[predictions.length - 1].glucose - latest;
  const confidence = clamp(1 - volatility / 55, 0.2, 0.95);
  const riskLevel = Math.max(...predictions.map((p) => p.glucose)) > 250 ? "High" : delta > 20 ? "Medium" : "Low";

  return {
    module: "glucose_prediction_lstm",
    input_summary: {
      glucose_points_used: glucoseSeries.length,
      meal_events_used: mealEvents.length,
      insulin_events_used: insulinEvents.length,
      time_window_hours: 24,
    },
    prediction: {
      current_glucose: latest,
      forecast_horizon_hours: 24,
      predicted_series: predictions,
      trend_curve: trendLabel(delta),
    },
    confidence_score: round2(confidence),
    risk_level: riskLevel,
    explanation: {
      patient: `Glucose is expected to stay mostly ${trendLabel(delta)} over the next day, based on your recent values, meals, and insulin records.`,
      doctor:
        "Forecast is generated from recent 24h glucose sequence with autoregressive decay, meal load, insulin correction, and circadian adjustment. Elevated volatility decreases confidence.",
      key_factors: [
        `Recent glucose baseline: ${round2(baseline)}`,
        `Estimated meal load impact: +${round2(recentMealLoad)}`,
        `Estimated insulin offset: -${round2(recentInsulinOffset)}`,
        `Short-term variability (std dev): ${round2(volatility)}`,
      ],
    },
    recommendation: "Continue routine monitoring and verify values with your doctor for treatment decisions.",
    requires_doctor_approval: false,
    alerts: [],
  };
}

function computeHypertensionRisk(payload) {
  const bpReadings = (payload.history.bpReadings || []).slice(-10);
  const systolicAvg = avg(bpReadings.map((b) => Number(b.systolic || 0)));
  const diastolicAvg = avg(bpReadings.map((b) => Number(b.diastolic || 0)));
  const age = Number(payload.vitals.age || 0);
  const weight = Number(payload.vitals.weight || 0);
  const activityScore = Number(payload.vitals.activityScore || 5);

  const z =
    -14 +
    0.055 * systolicAvg +
    0.04 * diastolicAvg +
    0.02 * age +
    0.008 * weight -
    0.18 * activityScore;
  const p = clamp(1 / (1 + Math.exp(-z)), 0.01, 0.99);

  let category = "Normal";
  if (systolicAvg >= 140 || diastolicAvg >= 90) category = "Stage 2";
  else if (systolicAvg >= 130 || diastolicAvg >= 80) category = "Stage 1";
  else if (systolicAvg >= 120 && diastolicAvg < 80) category = "Pre-Hypertension";

  return {
    module: "hypertension_risk_model",
    input_summary: {
      bp_points_used: bpReadings.length,
      average_systolic: round2(systolicAvg),
      average_diastolic: round2(diastolicAvg),
      age,
      weight,
      activity_score: activityScore,
    },
    prediction: {
      risk_category: category,
      probability_score: round2(p),
    },
    confidence_score: round2(clamp(0.65 + bpReadings.length * 0.03, 0.65, 0.95)),
    risk_level: p > 0.75 ? "High" : p > 0.45 ? "Medium" : "Low",
    explanation: {
      patient: `Your blood pressure pattern currently falls under "${category}". Keep regular checks and healthy lifestyle habits.`,
      doctor: "Classification combines threshold staging with logistic-regression style probability using BP averages, age, weight, and activity proxy.",
      key_factors: [
        `Systolic average: ${round2(systolicAvg)}`,
        `Diastolic average: ${round2(diastolicAvg)}`,
        `Age contribution: ${age}`,
        `Activity influence: ${activityScore}`,
      ],
    },
    recommendation: "Track BP twice daily and discuss sustained elevation with your physician.",
    requires_doctor_approval: false,
    alerts: [],
  };
}

function detectAnomalies(payload, glucoseModule, hypertensionModule) {
  const alerts = [];
  const currentGlucose = Number(payload.vitals.currentGlucose || 0);
  const currentSys = Number(payload.vitals.systolic || 0);
  const currentDia = Number(payload.vitals.diastolic || 0);
  const series = (payload.history.glucoseReadings || []).slice(-12).map((g) => Number(g.value || 0));
  const suddenJump = series.length >= 2 ? Math.abs(series[series.length - 1] - series[series.length - 2]) : 0;

  if (currentGlucose > 300 || currentGlucose < 60) {
    alerts.push({
      audience: "patient_doctor_caregiver",
      type: "glucose_critical",
      severity: "Critical",
      reading: currentGlucose,
      recommended_action: "Seek urgent medical assistance and confirm with a repeat reading.",
    });
  } else if (currentGlucose > 220 || currentGlucose < 75) {
    alerts.push({
      audience: "patient",
      type: "glucose_warning",
      severity: "High",
      reading: currentGlucose,
      recommended_action: "Recheck glucose within 15 minutes and notify care team if persistent.",
    });
  }

  if (suddenJump >= 55) {
    alerts.push({
      audience: "patient_doctor_caregiver",
      type: "glucose_spike_detected",
      severity: "Medium",
      reading: { change_mg_dl: suddenJump },
      recommended_action: "Repeat glucose check and monitor closely over the next hour.",
    });
  }

  if (currentSys >= 180 || currentDia >= 120) {
    alerts.push({
      audience: "patient_doctor_caregiver",
      type: "bp_hypertensive_crisis",
      severity: "Critical",
      reading: { systolic: currentSys, diastolic: currentDia },
      recommended_action: "Immediate emergency evaluation is recommended.",
    });
  } else if (currentSys >= 140 || currentDia >= 90) {
    alerts.push({
      audience: "doctor_caregiver",
      type: "bp_stage2",
      severity: "High",
      reading: { systolic: currentSys, diastolic: currentDia },
      recommended_action: "Prompt physician review and follow-up plan required.",
    });
  }

  return {
    module: "anomaly_detection_model",
    input_summary: {
      current_glucose: currentGlucose,
      current_bp: { systolic: currentSys, diastolic: currentDia },
      glucose_trend: glucoseModule.prediction.trend_curve,
      bp_risk_category: hypertensionModule.prediction.risk_category,
    },
    prediction: {
      anomalies_detected: alerts.length > 0,
      total_alerts: alerts.length,
    },
    confidence_score: 0.92,
    risk_level: alerts.some((a) => a.severity === "Critical")
      ? "Critical"
      : alerts.some((a) => a.severity === "High")
        ? "High"
        : alerts.some((a) => a.severity === "Medium")
          ? "Medium"
          : "Low",
    explanation: "Rules engine checks critical glucose and blood pressure thresholds in real time.",
    recommendation: alerts.length ? "Follow alert actions immediately." : "No acute anomaly detected.",
    requires_doctor_approval: false,
    alerts,
  };
}

function buildSmartRecommendations(payload, glucoseModule, hypertensionModule, anomalyModule) {
  const trend = glucoseModule.prediction?.trend_curve || "Stable";
  const peak = Math.max(...(glucoseModule.prediction?.predicted_series || []).map((p) => p.glucose));
  const predictedSeries = glucoseModule.prediction?.predicted_series || [];
  const currentGlucose = Number(glucoseModule.prediction?.current_glucose || payload?.vitals?.currentGlucose || 0);
  const predictedAverage = predictedSeries.length ? avg(predictedSeries.map((p) => Number(p.glucose || 0))) : currentGlucose;
  const meds = payload.history.medications || [];
  const hasMedicationHistory = meds.length > 0;
  const hasHighRiskAnomaly = anomalyModule.risk_level === "High" || anomalyModule.risk_level === "Critical";
  const doctorRules = payload?.history?.doctorRules || {};
  const correctionFactor = Number(doctorRules.correctionFactor || 40);
  const minDose = Number(doctorRules.minDose ?? 0);
  const maxDose = Number(doctorRules.maxDose ?? 8);
  const targetGlucose = Number(payload?.vitals?.glucoseTarget || 110);

  // More conservative + more variable: base on current value, with small forecast contribution.
  const blended = currentGlucose * 0.75 + predictedAverage * 0.25;
  const glucoseGap = Math.max(0, blended - targetGlucose);
  const rawDose = correctionFactor > 0 ? glucoseGap / correctionFactor : 0;
  const cappedDose = clamp(rawDose, minDose, maxDose);
  // Round to practical steps (0.5 units) to avoid tiny noisy decimals like 0.79.
  const suggestedDoseUnits = clamp(Math.round(cappedDose * 2) / 2, minDose, maxDose);
  const dosageRationale =
    suggestedDoseUnits <= minDose
      ? "No correction dose suggested from current AI estimate."
      : `Correction estimate uses blended glucose ${round2(blended)} mg/dL (current-weighted) vs target ${targetGlucose}, with correction factor ${correctionFactor}.`;

  const lifestyle = [];
  if (peak > 180) lifestyle.push("Reduce high-sugar meals and prefer lower-glycemic foods today.");
  if (hypertensionModule.prediction.risk_category === "Stage 1" || hypertensionModule.prediction.risk_category === "Stage 2") {
    lifestyle.push("Follow a low-sodium meal plan and track blood pressure twice today.");
  }
  if (trend === "Increasing") lifestyle.push("Plan a light walk and hydration in the next 2-3 hours if medically appropriate.");
  if (!lifestyle.length) lifestyle.push("Maintain your current healthy routine and continue regular monitoring.");

  const medicationAwareness = hasMedicationHistory
    ? "Medication pattern detected. Consult your doctor for any dosage adjustment."
    : "Medication history is limited. Medication may need review by your doctor.";
  const preventiveActions = [];
  if (trend === "Increasing") preventiveActions.push("Your glucose may rise in the next 3-6 hours. Take precautions before meals.");
  if (hypertensionModule.risk_level !== "Low") preventiveActions.push("Monitor BP closely today and share readings with your doctor.");
  if (hasHighRiskAnomaly) preventiveActions.push("High-risk signal detected. Contact your doctor promptly.");
  if (!preventiveActions.length) preventiveActions.push("No urgent action needed; continue routine checks.");

  return {
    module: "smart_recommendation_system",
    input_summary: {
      glucose_trend: trend,
      predicted_peak_glucose: round2(peak),
      hypertension_category: hypertensionModule.prediction.risk_category,
      anomaly_level: anomalyModule.risk_level,
      medication_history_points: meds.length,
    },
    prediction: {
      lifestyle_suggestions: lifestyle,
      medication_awareness: medicationAwareness,
      preventive_actions: preventiveActions,
      suggested_dose_units: suggestedDoseUnits,
      dosage_bounds: { min: minDose, max: maxDose },
      dosage_target_glucose: targetGlucose,
      dosage_rationale: dosageRationale,
    },
    confidence_score: round2(clamp((glucoseModule.confidence_score + hypertensionModule.confidence_score) / 2, 0, 1)),
    risk_level: anomalyModule.risk_level,
    explanation: {
      patient: "Recommendations are generated from predicted glucose trends, blood pressure risk, and anomaly signals.",
      doctor: "Recommendation engine merges forecasting outputs and risk-classification states to produce safe, clinician-supervised advice.",
      key_factors: [
        `Glucose trend: ${trend}`,
        `Predicted peak glucose: ${round2(peak)}`,
        `Hypertension category: ${hypertensionModule.prediction.risk_category}`,
      ],
    },
    recommendation: `AI suggested insulin correction dose: ${suggestedDoseUnits} units. This is decision support only. Doctor oversight is required for treatment changes.`,
    requires_doctor_approval: true,
    alerts: [],
  };
}

function safetyWrap(moduleOutput, disclaimer) {
  return {
    ...moduleOutput,
    recommendation: `${moduleOutput.recommendation} ${disclaimer}`.trim(),
  };
}

function runAiSimulation(payload) {
  const validation = validatePayload(payload);
  const disclaimer = "Consult your doctor before acting.";

  if (!validation.valid) {
    return {
      success: false,
      safety_status: "blocked",
      reason: validation.reason,
      output: {
        module: "safety_validation_layer",
        input_summary: {
          patientId: payload?.patientId || null,
        },
        prediction: null,
        confidence_score: 0,
        risk_level: "High",
        explanation: validation.reason,
        recommendation: `Insufficient or invalid data. ${disclaimer}`,
        requires_doctor_approval: true,
        alerts: [],
      },
    };
  }

  const glucoseModule = computeGlucosePrediction(payload);
  const hypertensionModule = computeHypertensionRisk(payload);
  const anomalyModule = detectAnomalies(payload, glucoseModule, hypertensionModule);
  const recommendationModule = buildSmartRecommendations(payload, glucoseModule, hypertensionModule, anomalyModule);

  const outputs = [
    safetyWrap(glucoseModule, disclaimer),
    safetyWrap(hypertensionModule, disclaimer),
    safetyWrap(anomalyModule, disclaimer),
    safetyWrap(recommendationModule, disclaimer),
  ];

  const explanationModule = {
    module: "ai_explanation_module",
    input_summary: {
      modules_covered: outputs.map((o) => o.module),
    },
    prediction: {
      patient_friendly_summary: outputs.map((o) => ({
        module: o.module,
        explanation: typeof o.explanation === "string" ? o.explanation : o.explanation.patient,
      })),
      doctor_summary: outputs.map((o) => ({
        module: o.module,
        explanation: typeof o.explanation === "string" ? o.explanation : o.explanation.doctor || o.explanation,
      })),
    },
    confidence_score: 0.88,
    risk_level: anomalyModule.risk_level,
    explanation: "Consolidated explanation generated for patient-facing and clinician-facing views.",
    recommendation: `Use this explanation as decision support only. ${disclaimer}`,
    requires_doctor_approval: false,
    alerts: anomalyModule.alerts,
  };

  return {
    success: true,
    safety_status: "validated",
    performance: {
      prediction_time_seconds_estimate: 2.4,
      api_response_target_seconds: "<2",
    },
    output: [...outputs, explanationModule],
  };
}

module.exports = { runAiSimulation };
