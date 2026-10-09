import pandas as pd
from music_recommender import UltimateRecommendationSystem
print("🎵 MUSIC SEARCH & RECOMMENDATIONS")
print("="*60)

# Load
full_db = pd.read_csv('spotify_songs_fixed.csv')
rec = UltimateRecommendationSystem()
rec.load_model('music_recommender.pkl')

print(f"\n✅ {len(full_db):,} songs ready to search!")
print("="*60)

def search(query):
    results = full_db[
        full_db['name'].str.contains(query, case=False, na=False) |
        full_db['artist'].str.contains(query, case=False, na=False)
    ].head(10)
    return results[['name', 'artist', 'genre', 'popularity']]

# Examples
print("\n📍 Example 1: Search for 'love'")
print("-"*60)
print(search('love').to_string(index=False))

print("\n📍 Example 2: Search for 'Drake'")
print("-"*60)
print(search('Drake').to_string(index=False))

print("\n📍 Example 3: Get recommendations")
print("-"*60)
# Pick a random popular song
test_song = full_db.nlargest(1, 'popularity').iloc[0]
print(f"For: '{test_song['name']}' by {test_song['artist']}\n")

try:
    recs = rec.recommend_smart(song_name=test_song['name'], n_recommendations=5)
    print(recs[['name', 'artist', 'recommendation_strength']].to_string(index=False))
except:
    print("(Song not in model, showing genre recommendations)")
    genre_songs = full_db[full_db['genre'] == test_song['genre']].nlargest(5, 'popularity')
    print(genre_songs[['name', 'artist', 'popularity']].to_string(index=False))

print("\n" + "="*60)
print("💡 INTERACTIVE MODE")
print("="*60)

while True:
    print("\n1. Search songs  2. Get recommendations  3. Mood playlist  4. Exit")
    choice = input("Choose (1-4): ").strip()

    if choice == '1':
        query = input("🔍 Search: ")
        results = search(query)
        print("\n" + "="*60)
        if results.empty:
            print("No results found")
        else:
            print(results.to_string(index=False))
        print("="*60)

    elif choice == '2':
        song = input("🎵 Song name: ")
        try:
            recs = rec.recommend_smart(song_name=song, n_recommendations=10)
            print("\n" + "="*60)
            print(recs.to_string(index=False))
            print("="*60)
        except:
            print("❌ Song not found in model")

    elif choice == '3':
        print("Moods: happy, sad, energetic, calm, party, romantic, workout, focus")
        mood = input("Mood: ")
        mins = input("Minutes (default 30): ") or "30"
        playlist = rec.generate_mood_playlist(mood, int(mins))
        print("\n" + "="*60)
        print(playlist.to_string(index=False))
        print("="*60)

    elif choice == '4':
        print("\n👋 Bye!")
        break
