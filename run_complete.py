import pandas as pd
import numpy as np
from music_recommender import UltimateRecommendationSystem

print("="*60)
print("🎵 COMPLETE MUSIC RECOMMENDATION SYSTEM")
print("="*60)

# Load and sample
print("\n1️⃣ Loading dataset...")
df = pd.read_csv('spotify_songs_fixed.csv')
print(f"✅ {len(df):,} songs loaded")

print("\n2️⃣ Sampling 5,000 diverse songs...")
SAMPLE_SIZE = 5000

genres = df['genre'].unique()
songs_per_genre = SAMPLE_SIZE // len(genres)

sampled_songs = []
for genre in genres:
    genre_songs = df[df['genre'] == genre]
    if len(genre_songs) > songs_per_genre:
        top = genre_songs.nlargest(songs_per_genre // 2, 'popularity')
        rand = genre_songs.sample(min(songs_per_genre // 2, len(genre_songs)))
        sampled_songs.append(pd.concat([top, rand]))
    else:
        sampled_songs.append(genre_songs)

df_sampled = pd.concat(sampled_songs).drop_duplicates()
df_sampled.to_csv('spotify_songs_optimized.csv', index=False)
print(f"✅ Using {len(df_sampled):,} songs")

# Build system
print("\n3️⃣ Building recommendation system...")
rec = UltimateRecommendationSystem()
rec.load_data('spotify_songs_optimized.csv')

print("\n4️⃣ Training models (1-2 min)...")
rec.build_all_models(use_deep_learning=False)

# Save immediately
print("\n5️⃣ Saving model...")
rec.save_model('music_recommender.pkl')
print("✅ Model saved!")

# Demo 1: Smart Recommendations
print("\n" + "="*60)
print("🎯 DEMO 1: SMART RECOMMENDATIONS")
print("="*60)

popular_songs = df_sampled.nlargest(5, 'popularity')
for idx, song in popular_songs.iterrows():
    try:
        print(f"\n🎵 Similar to: '{song['name']}' by {song['artist']}")
        print("-"*60)
        recs = rec.recommend_smart(song_name=song['name'], n_recommendations=5)
        print(recs[['name', 'artist', 'recommendation_strength']].to_string(index=False))
        break  # Just show one example
    except:
        continue

# Demo 2: Mood Playlists
print("\n" + "="*60)
print("🎭 DEMO 2: MOOD PLAYLISTS")
print("="*60)

for mood in ['happy', 'energetic', 'calm', 'party']:
    try:
        playlist = rec.generate_mood_playlist(mood, duration_minutes=10)
        if not playlist.empty:
            print(f"\n{mood.upper()} ({len(playlist)} songs):")
            print(playlist.head(3)[['name', 'artist']].to_string(index=False))
    except:
        continue

# Demo 3: Workout
print("\n" + "="*60)
print("💪 DEMO 3: WORKOUT PLAYLISTS")
print("="*60)

for intensity in ['low', 'medium', 'high']:
    try:
        workout = rec.generate_workout_playlist(intensity, 15)
        if not workout.empty:
            print(f"\n{intensity.upper()}:")
            print(workout.head(3)[['name', 'artist', 'energy']].to_string(index=False))
    except:
        continue

# Demo 4: Genre Analysis
print("\n" + "="*60)
print("🎸 DEMO 4: TOP GENRES")
print("="*60)

genre_counts = df_sampled['genre'].value_counts().head(10)
print(genre_counts.to_string())

# Demo 5: Top Songs
print("\n" + "="*60)
print("🔥 DEMO 5: TOP 10 SONGS")
print("="*60)

top_songs = df_sampled.nlargest(10, 'popularity')
print(top_songs[['name', 'artist', 'genre', 'popularity']].to_string(index=False))

# Final Summary
print("\n" + "="*60)
print("✅ SYSTEM READY!")
print("="*60)

print(f"""
📊 Your Music Database:
   • Total songs: {len(df):,}
   • Active model: {len(df_sampled):,}
   • Genres: {df_sampled['genre'].nunique()}
   • Artists: {df_sampled['artist'].nunique()}
   • Model saved: music_recommender.pkl

🎯 What You Can Do:
   1. Search any song from 114,000 songs
   2. Get AI-powered recommendations
   3. Generate mood-based playlists
   4. Create workout playlists
   5. Explore by genre

💡 Next Step: Run interactive mode!
   py simple_search.py
""")
