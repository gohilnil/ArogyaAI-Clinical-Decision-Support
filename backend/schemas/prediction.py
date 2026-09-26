"""Request/response schemas and the categorical vocabularies the model was trained on.

The VALID_* sets and PredictRequest are moved unchanged from backend/index.py.
"""
from typing import Optional

from pydantic import BaseModel, validator

# Valid categorical values matching the trained model's encoder classes exactly
VALID_GENDERS = {"Male", "Female"}
VALID_DOSHAS = {"Vata", "Pitta", "Kapha", "Vata-Pitta", "Vata-Kapha", "Pitta-Kapha"}
VALID_FOOD_HABITS = {
    "Vegetarian", "Non-vegetarian", "Vegan", "Occasionally_non_veg",
    "Spicy_food_lover", "Sweet_food_lover", "Heavy_meals", "Light_meals",
    "Irregular_eating", "Frequent_snacking", "Hot_food_preference",
    "Cold_food_preference", "Fast_food_consumer", "Bitter_taste_aversion",
    "Salty_food_preference", "Sour_food_preference",
}
VALID_MEDICATIONS = {
    "Unknown", "Pain_killers", "Antibiotics", "Antidepressants",
    "Blood_pressure_medication", "Diabetes_medication", "Thyroid_medication",
    "Cholesterol_medication", "Heart_medication", "Asthma_medication",
    "Steroids", "Blood_thinners", "Multivitamins", "Calcium_supplements",
    "Sleep_medication", "Acid_reducers", "Birth_control_pills",
}
VALID_ALLERGIES = {
    "Unknown", "Drug_allergy", "Food_allergy", "Dust_allergy", "Pollen_allergy",
    "Pet_allergy", "Skin_allergy", "Nut_allergy", "Milk_allergy",
    "Egg_allergy", "Gluten_allergy", "Soy_allergy", "Seafood_allergy",
    "Chemical_sensitivity",
}
VALID_SEASONS = {"Summer", "Monsoon", "Winter", "Spring", "Autumn", "Pre_winter"}
VALID_WEATHER = {
    "Hot_humid", "Hot_dry", "Cold_dry", "Cold_humid", "Moderate", "Rainy",
    "Cloudy", "Sunny", "Windy", "Extreme_heat", "Extreme_cold",
}


class PredictRequest(BaseModel):
    Symptoms: str
    Age: int
    Height_cm: int
    Weight_kg: int
    Gender: str
    Body_Type_Dosha_Sanskrit: str
    Food_Habits: str = "Vegetarian"
    Current_Medication: str = "Unknown"
    Allergies: str = "Unknown"
    Season: str = "Summer"
    Weather: str = "Moderate"

    @validator("Symptoms")
    def symptoms_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Symptoms field cannot be empty.")
        return v.strip()

    @validator("Age")
    def age_in_range(cls, v: int) -> int:
        if v < 1 or v > 120:
            raise ValueError("Age must be between 1 and 120.")
        return v

    @validator("Height_cm")
    def height_in_range(cls, v: int) -> int:
        if v < 50 or v > 250:
            raise ValueError("Height must be between 50 and 250 cm.")
        return v

    @validator("Weight_kg")
    def weight_in_range(cls, v: int) -> int:
        if v < 10 or v > 300:
            raise ValueError("Weight must be between 10 and 300 kg.")
        return v


class FeatureContribution(BaseModel):
    """One term in the model's own score for the predicted condition."""

    feature: str
    group: str  # "symptom" | "profile"
    input_value: str
    contribution: float
    direction: str  # "supports" | "opposes"


class PredictExplanation(BaseModel):
    """The model's real per-feature contributions, not a post-hoc narrative."""

    method: str
    predicted_class: str
    intercept: float
    total_contribution: float
    features: list[FeatureContribution]
    note: str


class PredictResponse(BaseModel):
    """Explicit response contract for POST /api/predict.

    `ml_prediction` carries the model's raw label when the confidence gate
    suppresses it, so it is present only on the low-confidence path.

    `explanation` is present when the deployed estimator exposes coefficients
    (a linear model). It is omitted rather than faked for estimators that do
    not, so the frontend must treat it as optional.
    """

    prediction: str
    confidence: float
    recommendation: str
    ml_prediction: Optional[str] = None
    explanation: Optional[PredictExplanation] = None
