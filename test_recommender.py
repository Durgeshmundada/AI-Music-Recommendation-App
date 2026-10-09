from ultimate_recommender import UltimateRecommendationSystem
import pandas as pd

# Initialize
recommender = UltimateRecommendationSystem()

# Load data
try:
    recommender.load_data(
        songs_path='spotify_songs.csv',
        listening_history_path=None  # We'll skip this for now
    )

    # Build models (without deep learning for faster testing)
    recommender.build_all_models(use_deep_learning=False)

    # Test a simple recommendation
    print("\n🎵 Testing recommendations...")
    recs = recommender.recommend_smart(
        song_name='',  # Leave empty or put any song name from your dataset
        n_recommendations=5
    )
    print(recs)

    print("\n✅ SUCCESS! Everything is working!")

except FileNotFoundError as e:
    print(f"❌ File not found: {e}")
    print("\nMake sure 'spotify_songs.csv' is in the same folder!")

except Exception as e:
    print(f"❌ Error: {e}")
    print("\nDon't worry! Send me the error and I'll help you fix it.")
