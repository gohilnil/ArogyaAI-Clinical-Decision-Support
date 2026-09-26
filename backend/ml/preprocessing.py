"""Feature preparation for the trained model.

`preprocess_input` reproduces the feature construction used at training time so
inference produces identical features. The encoders, TF-IDF vectorizer and
scaler loaded here were fitted on the training split only (`ml/train.py`), so
nothing about the test set influences inference.

Feature order matters and is not self-documenting: the column order is taken
from `scaler.get_feature_names_out()` rather than assumed, because the model's
coefficients are positional. Reordering these columns would silently produce
wrong predictions instead of an error.
"""
import pandas as pd

from backend.ml.model_loader import (
    encoders,
    scaler,
    training_feature_columns,
    vectorizer,
)
from backend.schemas.prediction import (
    VALID_ALLERGIES,
    VALID_DOSHAS,
    VALID_FOOD_HABITS,
    VALID_GENDERS,
    VALID_MEDICATIONS,
    VALID_SEASONS,
    VALID_WEATHER,
)

CATEGORICAL_COLUMNS = [
    "Age_Group",
    "Gender",
    "Body_Type_Dosha_Sanskrit",
    "Food_Habits",
    "Current_Medication",
    "Allergies",
    "Season",
    "Weather",
]


def derive_age_group(age: int) -> str:
    """
    Map a numeric age to the Age_Group string used during model training.
    The encoder knows: Adolescent, Child, Elderly, Middle Age, Senior, Young Adult
    """
    if age <= 12:
        return "Child"
    elif 13 <= age <= 19:
        return "Adolescent"
    elif 20 <= age <= 35:
        return "Young Adult"
    elif 36 <= age <= 55:
        return "Middle Age"
    elif 56 <= age <= 70:
        return "Senior"
    else:
        return "Elderly"


def normalize_categoricals(user_dict: dict) -> dict:
    """Map unseen categorical values onto their closest valid encoder class.

    Behaviour is identical to the inline normalisation in the original
    backend/index.py, including the same fallback value for each field.
    """
    fallbacks = {
        "Gender": (VALID_GENDERS, "Male"),
        "Body_Type_Dosha_Sanskrit": (VALID_DOSHAS, "Vata"),
        "Food_Habits": (VALID_FOOD_HABITS, "Vegetarian"),
        "Current_Medication": (VALID_MEDICATIONS, "Unknown"),
        "Allergies": (VALID_ALLERGIES, "Unknown"),
        "Season": (VALID_SEASONS, "Summer"),
        "Weather": (VALID_WEATHER, "Moderate"),
    }
    for field, (allowed, default) in fallbacks.items():
        if user_dict.get(field) not in allowed:
            user_dict[field] = default
    return user_dict


def preprocess_input(user_data):
    """
    Preprocesses raw user input into a format the ML model can understand.
    """
    # Create a DataFrame from the user data
    user_df = pd.DataFrame([user_data])

    # Categorize Age into Age_Group if missing
    if "Age_Group" not in user_df.columns and "Age" in user_df.columns:
        age_val = user_df["Age"].iloc[0]
        if age_val < 13:
            user_df["Age_Group"] = "Child"
        elif 13 <= age_val < 20:
            user_df["Age_Group"] = "Adolescent"
        elif 20 <= age_val < 60:
            user_df["Age_Group"] = "Adult"
        else:
            user_df["Age_Group"] = "Senior"
    elif "Age_Group" not in user_df.columns:
        user_df["Age_Group"] = "Adult"

    # Calculate BMI if not provided
    if "BMI" not in user_df.columns:
        user_df["BMI"] = user_df["Weight_kg"] / (user_df["Height_cm"] / 100) ** 2

    # Encode categorical features using the loaded encoders
    for col in CATEGORICAL_COLUMNS:
        # Use a default value (0) if a category is new or unseen
        encoded_values = []
        for item in user_df[col]:
            try:
                # The encoder expects a list or array
                encoded_values.append(encoders[col].transform([item])[0])
            except ValueError:
                # Handle unseen labels by assigning a default value, e.g., 0
                encoded_values.append(0)
        user_df[f"{col}_encoded"] = encoded_values

    # Vectorize symptoms using the loaded TF-IDF vectorizer
    tfidf_features = vectorizer.transform(user_df["Symptoms"]).toarray()

    # TF-IDF column names must match the training process ('tfidf_0', 'tfidf_1', ...)
    tfidf_cols = [f"tfidf_{i}" for i in range(tfidf_features.shape[1])]
    tfidf_df = pd.DataFrame(tfidf_features, columns=tfidf_cols)

    # Combine all features
    base_feature_df = user_df[training_feature_columns].reset_index(drop=True)
    final_df = pd.concat([base_feature_df, tfidf_df], axis=1)

    # Ensure the final DataFrame columns exactly match what the scaler was fitted on.
    # This handles any discrepancy in the number of TF-IDF features.
    scaler_feature_names = scaler.get_feature_names_out()
    final_df = final_df.reindex(columns=scaler_feature_names, fill_value=0)

    # Scale the features using the loaded scaler
    scaled_features = scaler.transform(final_df)
    return scaled_features
