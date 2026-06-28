import os
import pickle
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

# 1. Dataset: Labeled privacy policy sentences
DATASET = [
    # selling user data
    ("We sell your personal data to third-party brokers.", "selling user data"),
    ("We monetize your information by selling it to data syndicates.", "selling user data"),
    ("Your browsing profile may be sold to advertising networks.", "selling user data"),
    # location tracking
    ("We collect your precise GPS location coordinates.", "location tracking"),
    ("This app tracks your background geographical location.", "location tracking"),
    ("We access your device geolocation data to provide local search.", "location tracking"),
    # third party sharing
    ("We share your telemetry with Microsoft and our hosting subprocessors.", "third party sharing"),
    ("Your records are shared with partners to help run our service.", "third party sharing"),
    ("Data is disclosed to infrastructure vendors for operational support.", "third party sharing"),
    # device access
    ("We request permission to access your camera and microphone.", "device access"),
    ("The application reads your phone contacts and photo gallery.", "device access"),
    ("We access local device sensors and hardware features.", "device access"),
    # behavioral tracking
    ("We use tracking pixels to monitor your search and reading activities.", "behavioral tracking"),
    ("Advertisements are targeted based on your browsing history.", "behavioral tracking"),
    ("We build a profile of your interests to deliver behavioral ads.", "behavioral tracking"),
    # data retention
    ("We retain database records indefinitely even after account deletion.", "data retention"),
    ("Log data is stored for a period of seven years.", "data retention"),
    ("We keep your chat history and files in our archives permanently.", "data retention"),
    # user rights
    ("You can request deletion of your account and personal information.", "user rights"),
    ("Users have the right to access and download their data.", "user rights"),
    ("You can opt-out of marketing communications at any time.", "user rights"),
    # security practices
    ("All personal data is encrypted in transit and at rest.", "security practices"),
    ("We use security safeguards to protect your credentials.", "security practices"),
    ("We monitor our systems for unauthorized database access.", "security practices"),
    # cookies
    ("We place cookies and tracking pixels in your browser.", "cookies"),
    ("We store session tokens in your browser's local storage.", "cookies"),
    ("Cookies are used to recognize your browser on return visits.", "cookies"),
    # irrelevant
    ("Welcome to our website homepage.", "irrelevant"),
    ("We are a Y Combinator backed insurance tech startup.", "irrelevant"),
    ("Click here to log into your workspace dashboard.", "irrelevant"),
    ("Our team consists of engineers and product designers.", "irrelevant"),
]

def train_model():
    print("1. Loading training dataset...")
    texts = [item[0] for item in DATASET]
    labels = [item[1] for item in DATASET]

    # Split dataset for basic validation
    X_train, X_test, y_train, y_test = train_test_split(texts, labels, test_size=0.2, random_state=42)

    print("2. Constructing pipeline (TF-IDF + Logistic Regression)...")
    pipeline = Pipeline([
        ('tfidf', TfidfVectorizer(ngram_range=(1, 2), min_df=1, stop_words='english')),
        ('clf', LogisticRegression(C=1.0, max_iter=200, class_weight='balanced'))
    ])

    print("3. Training the model...")
    pipeline.fit(X_train, y_train)

    print("4. Evaluating model performance on validation split...")
    y_pred = pipeline.predict(X_test)
    print(classification_report(y_test, y_pred, zero_division=0))

    # Retrain on full dataset before saving
    print("5. Retraining model on full dataset...")
    pipeline.fit(texts, labels)

    model_path = os.path.join(os.path.dirname(__file__), "privacy_classifier.pkl")
    print(f"6. Saving trained model file to: {model_path}")
    with open(model_path, "wb") as f:
        pickle.dump(pipeline, f)
    
    print("\nTraining completed successfully! You can run this script anytime to retrain.")

if __name__ == "__main__":
    train_model()
