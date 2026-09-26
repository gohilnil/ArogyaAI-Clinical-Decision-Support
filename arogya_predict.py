"""ArogyaAI — predictive pipeline and command-line interface.

The prediction logic now lives in the `backend` package:

    backend.ml.model_loader       model artifact loading
    backend.ml.preprocessing      feature preparation
    backend.ai.gemini_service     Ayurvedic contextual explanation

This module re-exports those names so existing imports keep working, and keeps
the interactive CLI (`python arogya_predict.py`) that the README documents.
"""
import numpy as np

from backend.ai.gemini_service import get_llm_validation_and_explanation
from backend.ml.model_loader import (
    encoders,
    model,
    model_components,
    scaler,
    training_feature_columns,
    vectorizer,
)
from backend.ml.preprocessing import preprocess_input

__all__ = [
    "encoders",
    "model",
    "model_components",
    "scaler",
    "training_feature_columns",
    "vectorizer",
    "preprocess_input",
    "get_llm_validation_and_explanation",
]


def get_safe_number_input(prompt, converter=int):
    """
    Safely gets numeric input from the user, handling ValueErrors.
    """
    while True:
        try:
            return converter(input(prompt))
        except ValueError:
            print(f"❌ Invalid input. Please enter a valid {'number' if converter == float else 'integer'}.")


def main():
    """
    Main function to run the prediction workflow.
    """
    print("=" * 60)
    print("AROGYA AI - Integrated ML + LLM Prediction System")
    print("=" * 60)
    print("Please provide your details to receive a personalized analysis.")
    print("-" * 60)

    # --- User Input Section ---
    symptoms = input("Enter your symptoms (comma-separated): ")
    age = get_safe_number_input("Enter your age: ")
    height_cm = get_safe_number_input("Enter your height (cm): ")
    weight_kg = get_safe_number_input("Enter your weight (kg): ")
    gender = input("Enter your gender: ")

    # Ask for body type in simple English
    body_type_english = input("Enter your general body type (e.g., Thin, Medium, Heavy): ").strip().lower()

    # Map English input to Sanskrit Dosha terms
    dosha_map = {
        "thin": "Vata",
        "medium": "Pitta",
        "heavy": "Kapha",
    }
    # Default to 'Vata' if the input is not recognized
    body_type_sanskrit = dosha_map.get(body_type_english, "Vata")

    food_habits = input("Enter your food habits (e.g., Vegetarian, Non-Vegetarian, Mixed): ")
    current_medication = input("Enter your current medication (if any, otherwise type 'None'): ")
    allergies = input("Enter any allergies (if any, otherwise type 'None'): ")
    season = input("Enter the current season (e.g., Summer, Monsoon, Winter): ")
    weather = input("Enter the current weather (e.g., Hot, Humid, Cold): ")

    # Automatically determine Age_Group from age
    if age <= 12:
        age_group = "Child"
    elif 13 <= age <= 19:
        age_group = "Adolescent"
    elif 20 <= age <= 39:
        age_group = "Young Adult"
    elif 40 <= age <= 59:
        age_group = "Middle-Aged Adult"
    else:
        age_group = "Senior"

    # Assemble the user_data dictionary for processing
    user_data = {
        "Symptoms": symptoms,
        "Age": age,
        "Height_cm": height_cm,
        "Weight_kg": weight_kg,
        "Gender": gender,
        "Age_Group": age_group,
        "Body_Type_Dosha_Sanskrit": body_type_sanskrit,
        "Food_Habits": food_habits,
        "Current_Medication": current_medication,
        "Allergies": allergies,
        "Season": season,
        "Weather": weather,
    }

    # --- ML Model Prediction (Internal) ---
    print("\nAnalyzing your information...")
    try:
        features = preprocess_input(user_data)

        prediction = model.predict(features)
        prediction_proba = model.predict_proba(features)
        predicted_disease = encoders["Disease"].inverse_transform(prediction)[0]
        confidence = np.max(prediction_proba)

        print(f"   => ML Model Prediction: '{predicted_disease}' (Confidence: {confidence:.2%})")

    except Exception as e:
        print(f"   => Error during analysis: {e}")
        return

    # --- LLM Validation and Explanation ---
    llm_explanation = get_llm_validation_and_explanation(user_data, predicted_disease, confidence)

    print("\n" + "=" * 60)
    print("🌿 Arogya AI - Personalized Ayurvedic Analysis 🌿")
    print("=" * 60)
    print(llm_explanation)


if __name__ == "__main__":
    main()
