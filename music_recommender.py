
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler, MinMaxScaler, LabelEncoder
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.decomposition import TruncatedSVD, NMF
from sklearn.cluster import KMeans
from scipy.sparse import csr_matrix
from collections import defaultdict, Counter
from datetime import datetime, timedelta
import pickle
import json
import warnings
warnings.filterwarnings('ignore')

# Optional: Deep Learning imports (install: pip install tensorflow)
try:
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers, Model, regularizers
    DEEP_LEARNING_AVAILABLE = True
except ImportError:
    DEEP_LEARNING_AVAILABLE = False
    print("⚠️  TensorFlow not installed. Deep learning features disabled.")
    print("   Install with: pip install tensorflow")

# Optional: Spotify API (install: pip install spotipy)
try:
    import spotipy
    from spotipy.oauth2 import SpotifyClientCredentials
    SPOTIFY_API_AVAILABLE = True
except ImportError:
    SPOTIFY_API_AVAILABLE = False
    print("⚠️  Spotipy not installed. Spotify API features disabled.")
    print("   Install with: pip install spotipy")


class NeuralCollaborativeFiltering:
    """Deep Learning-based Collaborative Filtering"""

    def __init__(self, n_users, n_items, embedding_dim=50, hidden_layers=[128, 64, 32]):
        self.n_users = n_users
        self.n_items = n_items
        self.embedding_dim = embedding_dim
        self.hidden_layers = hidden_layers
        self.model = None

    def build_model(self):
        """Build Neural Collaborative Filtering model"""
        # User input
        user_input = layers.Input(shape=(1,), name='user_input')
        user_embedding = layers.Embedding(
            self.n_users, self.embedding_dim,
            embeddings_regularizer=regularizers.l2(1e-6),
            name='user_embedding'
        )(user_input)
        user_vec = layers.Flatten()(user_embedding)

        # Item input
        item_input = layers.Input(shape=(1,), name='item_input')
        item_embedding = layers.Embedding(
            self.n_items, self.embedding_dim,
            embeddings_regularizer=regularizers.l2(1e-6),
            name='item_embedding'
        )(item_input)
        item_vec = layers.Flatten()(item_embedding)

        # Concatenate embeddings
        concat = layers.Concatenate()([user_vec, item_vec])

        # Hidden layers
        x = concat
        for units in self.hidden_layers:
            x = layers.Dense(units, activation='relu',
                           kernel_regularizer=regularizers.l2(1e-6))(x)
            x = layers.Dropout(0.3)(x)

        # Output layer
        output = layers.Dense(1, activation='sigmoid', name='output')(x)

        # Compile model
        self.model = Model(inputs=[user_input, item_input], outputs=output)
        self.model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss='binary_crossentropy',
            metrics=['accuracy', 'AUC']
        )

        return self.model

    def train(self, train_data, validation_split=0.2, epochs=10, batch_size=256):
        """Train the NCF model"""
        if self.model is None:
            self.build_model()

        history = self.model.fit(
            [train_data['user_ids'], train_data['item_ids']],
            train_data['ratings'],
            validation_split=validation_split,
            epochs=epochs,
            batch_size=batch_size,
            verbose=1,
            callbacks=[
                keras.callbacks.EarlyStopping(patience=3, restore_best_weights=True),
                keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=2)
            ]
        )

        return history

    def predict(self, user_ids, item_ids):
        """Predict ratings for user-item pairs"""
        return self.model.predict([user_ids, item_ids], verbose=0)


class MoodAnalyzer:
    """Analyze and classify song moods"""

    MOOD_PROFILES = {
        'happy': {'valence': (0.6, 1.0), 'energy': (0.5, 1.0), 'danceability': (0.5, 1.0)},
        'sad': {'valence': (0.0, 0.4), 'energy': (0.0, 0.5), 'acousticness': (0.3, 1.0)},
        'energetic': {'energy': (0.7, 1.0), 'tempo': (120, 200), 'danceability': (0.6, 1.0)},
        'calm': {'energy': (0.0, 0.4), 'acousticness': (0.5, 1.0), 'instrumentalness': (0.3, 1.0)},
        'party': {'danceability': (0.7, 1.0), 'energy': (0.7, 1.0), 'valence': (0.6, 1.0)},
        'romantic': {'valence': (0.4, 0.8), 'acousticness': (0.3, 0.8), 'energy': (0.2, 0.6)},
        'workout': {'energy': (0.8, 1.0), 'tempo': (130, 180), 'danceability': (0.5, 1.0)},
        'focus': {'instrumentalness': (0.5, 1.0), 'energy': (0.3, 0.7), 'speechiness': (0.0, 0.2)}
    }

    @staticmethod
    def detect_mood(song_features):
        """Detect the primary mood of a song"""
        mood_scores = {}

        for mood, profile in MoodAnalyzer.MOOD_PROFILES.items():
            score = 0
            count = 0

            for feature, (min_val, max_val) in profile.items():
                if feature in song_features:
                    value = song_features[feature]
                    if min_val <= value <= max_val:
                        score += 1
                    count += 1

            mood_scores[mood] = score / count if count > 0 else 0

        return max(mood_scores.items(), key=lambda x: x[1])

    @staticmethod
    def get_mood_vector(song_features):
        """Get mood probabilities for all moods"""
        mood_scores = {}

        for mood, profile in MoodAnalyzer.MOOD_PROFILES.items():
            score = 0
            count = 0

            for feature, (min_val, max_val) in profile.items():
                if feature in song_features:
                    value = song_features[feature]
                    # Calculate how well the value fits the range
                    if min_val <= value <= max_val:
                        center = (min_val + max_val) / 2
                        range_size = max_val - min_val
                        distance = abs(value - center) / range_size
                        score += (1 - distance)
                    count += 1

            mood_scores[mood] = score / count if count > 0 else 0

        # Normalize
        total = sum(mood_scores.values())
        if total > 0:
            mood_scores = {k: v/total for k, v in mood_scores.items()}

        return mood_scores


class TemporalRecommender:
    """Handle time-based and trending recommendations"""

    def __init__(self):
        self.trending_scores = {}
        self.time_decay_factor = 0.95  # Daily decay

    def update_trending(self, listening_history, current_date=None):
        """Calculate trending scores based on recent activity"""
        if current_date is None:
            current_date = datetime.now()

        if 'timestamp' not in listening_history.columns:
            # If no timestamp, treat all as recent
            song_counts = listening_history['song_id'].value_counts()
            self.trending_scores = (song_counts / song_counts.max()).to_dict()
            return

        # Convert timestamp to datetime
        listening_history['date'] = pd.to_datetime(listening_history['timestamp'])

        # Calculate days ago
        listening_history['days_ago'] = (current_date - listening_history['date']).dt.days

        # Apply exponential decay
        listening_history['weighted_play'] = (
            listening_history['play_count'] *
            (self.time_decay_factor ** listening_history['days_ago'])
        )

        # Sum weighted plays per song
        trending = listening_history.groupby('song_id')['weighted_play'].sum()

        # Normalize
        self.trending_scores = (trending / trending.max()).to_dict()

    def get_trending_songs(self, songs_df, n_songs=50):
        """Get currently trending songs"""
        songs_df['trending_score'] = songs_df['song_id'].map(self.trending_scores).fillna(0)
        return songs_df.nlargest(n_songs, 'trending_score')

    def get_time_appropriate_songs(self, songs_df, hour=None):
        """Get songs appropriate for time of day"""
        if hour is None:
            hour = datetime.now().hour

        # Time-based energy mapping
        if 6 <= hour < 12:  # Morning
            return songs_df[
                (songs_df['energy'] > 0.5) & (songs_df['valence'] > 0.4)
            ]
        elif 12 <= hour < 18:  # Afternoon
            return songs_df[songs_df['energy'] > 0.4]
        elif 18 <= hour < 22:  # Evening
            return songs_df[
                (songs_df['energy'] > 0.3) & (songs_df['valence'] > 0.3)
            ]
        else:  # Night
            return songs_df[
                (songs_df['energy'] < 0.6) & (songs_df['acousticness'] > 0.3)
            ]


class PlaylistGenerator:
    """Generate smart playlists based on various criteria"""

    @staticmethod
    def create_mood_playlist(songs_df, mood, duration_minutes=60, diversity=0.3):
        """Generate a playlist for a specific mood"""
        # Add mood scores
        mood_scores = []
        for _, song in songs_df.iterrows():
            features = song[['valence', 'energy', 'danceability', 'acousticness',
                           'instrumentalness', 'speechiness', 'tempo']].to_dict()
            mood_vec = MoodAnalyzer.get_mood_vector(features)
            mood_scores.append(mood_vec.get(mood, 0))

        songs_df['mood_score'] = mood_scores

        # Filter songs that fit the mood
        mood_songs = songs_df[songs_df['mood_score'] > 0.3].copy()

        if mood_songs.empty:
            return pd.DataFrame()

        # Build playlist considering duration and diversity
        playlist = []
        total_duration = 0
        target_duration = duration_minutes * 60 * 1000  # Convert to ms

        # Sort by mood score
        mood_songs = mood_songs.sort_values('mood_score', ascending=False)

        # Select songs with diversity
        used_artists = set()
        for _, song in mood_songs.iterrows():
            if total_duration >= target_duration:
                break

            # Diversity check
            if diversity > 0 and song['artist'] in used_artists:
                if np.random.random() > (1 - diversity):
                    continue

            playlist.append(song)
            total_duration += song.get('duration_ms', 180000)
            used_artists.add(song['artist'])

        return pd.DataFrame(playlist)

    @staticmethod
    def create_transition_playlist(songs_df, start_song, end_song, n_songs=10):
        """Create a smooth transition playlist between two songs"""
        # Extract features
        feature_cols = ['danceability', 'energy', 'valence', 'tempo', 'acousticness']

        start_features = start_song[feature_cols].values
        end_features = end_song[feature_cols].values

        # Create interpolation points
        interpolations = []
        for i in range(n_songs):
            alpha = i / (n_songs - 1)
            interpolated = start_features * (1 - alpha) + end_features * alpha
            interpolations.append(interpolated)

        # Find songs closest to each interpolation point
        playlist = []
        used_indices = set([start_song.name])

        for target_features in interpolations:
            # Calculate distances
            songs_features = songs_df[feature_cols].values
            distances = np.linalg.norm(songs_features - target_features, axis=1)

            # Find closest unused song
            for idx in np.argsort(distances):
                if idx not in used_indices:
                    playlist.append(songs_df.iloc[idx])
                    used_indices.add(idx)
                    break

        return pd.DataFrame(playlist)

    @staticmethod
    def create_workout_playlist(songs_df, duration_minutes=45, intensity='medium'):
        """Generate workout playlist with progressive intensity"""
        intensity_map = {
            'low': {'energy': (0.5, 0.7), 'tempo': (100, 130)},
            'medium': {'energy': (0.6, 0.8), 'tempo': (120, 150)},
            'high': {'energy': (0.7, 1.0), 'tempo': (140, 180)}
        }

        energy_range, tempo_range = intensity_map[intensity].values()

        # Filter workout-appropriate songs
        workout_songs = songs_df[
            (songs_df['energy'].between(*energy_range)) &
            (songs_df['tempo'].between(*tempo_range))
        ].copy()

        if workout_songs.empty:
            return pd.DataFrame()

        # Create progressive intensity curve
        n_songs = int(duration_minutes / 3.5)  # ~3.5 min per song

        # Warm-up (20%), peak (60%), cool-down (20%)
        warmup_n = int(n_songs * 0.2)
        peak_n = int(n_songs * 0.6)
        cooldown_n = n_songs - warmup_n - peak_n

        # Sort by energy
        workout_songs = workout_songs.sort_values('energy')

        # Select songs
        total_songs = len(workout_songs)
        warmup = workout_songs.iloc[:total_songs//3].sample(min(warmup_n, len(workout_songs)))
        peak = workout_songs.iloc[total_songs//3:2*total_songs//3].sample(min(peak_n, len(workout_songs)))
        cooldown = workout_songs.iloc[2*total_songs//3:].sample(min(cooldown_n, len(workout_songs)))

        playlist = pd.concat([warmup, peak, cooldown])
        return playlist


class ABTestingFramework:
    """A/B Testing for recommendation algorithms"""

    def __init__(self):
        self.experiments = {}
        self.results = defaultdict(lambda: {'impressions': 0, 'clicks': 0,
                                           'listen_time': 0, 'skips': 0})

    def create_experiment(self, experiment_name, variants):
        """
        Create a new A/B test

        Args:
            experiment_name: Name of the experiment
            variants: Dict of variant_name -> recommendation_function
        """
        self.experiments[experiment_name] = {
            'variants': variants,
            'active': True
        }

    def get_variant(self, experiment_name, user_id):
        """Assign user to a variant (deterministic based on user_id)"""
        if experiment_name not in self.experiments:
            return None

        variants = list(self.experiments[experiment_name]['variants'].keys())
        variant_idx = hash(str(user_id) + experiment_name) % len(variants)
        return variants[variant_idx]

    def record_impression(self, experiment_name, variant, user_id):
        """Record that recommendations were shown"""
        key = f"{experiment_name}:{variant}"
        self.results[key]['impressions'] += 1

    def record_click(self, experiment_name, variant, user_id, song_id):
        """Record that user clicked/played a recommendation"""
        key = f"{experiment_name}:{variant}"
        self.results[key]['clicks'] += 1

    def record_listen_time(self, experiment_name, variant, user_id, seconds):
        """Record listening time"""
        key = f"{experiment_name}:{variant}"
        self.results[key]['listen_time'] += seconds

    def record_skip(self, experiment_name, variant, user_id):
        """Record that user skipped the song"""
        key = f"{experiment_name}:{variant}"
        self.results[key]['skips'] += 1

    def get_results(self, experiment_name):
        """Calculate metrics for all variants"""
        variants = self.experiments[experiment_name]['variants'].keys()
        results = {}

        for variant in variants:
            key = f"{experiment_name}:{variant}"
            data = self.results[key]

            ctr = data['clicks'] / data['impressions'] if data['impressions'] > 0 else 0
            avg_listen = data['listen_time'] / data['clicks'] if data['clicks'] > 0 else 0
            skip_rate = data['skips'] / data['clicks'] if data['clicks'] > 0 else 0

            results[variant] = {
                'impressions': data['impressions'],
                'clicks': data['clicks'],
                'ctr': ctr,
                'avg_listen_time': avg_listen,
                'skip_rate': skip_rate,
                'engagement_score': ctr * avg_listen * (1 - skip_rate)
            }

        return results


class SpotifyIntegration:
    """Integration with Spotify API"""

    def __init__(self, client_id=None, client_secret=None):
        if not SPOTIFY_API_AVAILABLE:
            print("⚠️  Spotify API not available. Install spotipy.")
            self.sp = None
            return

        if client_id and client_secret:
            auth_manager = SpotifyClientCredentials(
                client_id=client_id,
                client_secret=client_secret
            )
            self.sp = spotipy.Spotify(auth_manager=auth_manager)
        else:
            self.sp = None

    def search_song(self, song_name, artist=None):
        """Search for a song on Spotify"""
        if not self.sp:
            return None

        query = song_name
        if artist:
            query += f" artist:{artist}"

        results = self.sp.search(q=query, type='track', limit=1)

        if results['tracks']['items']:
            return results['tracks']['items'][0]
        return None

    def get_audio_features(self, track_id):
        """Get audio features for a track"""
        if not self.sp:
            return None

        return self.sp.audio_features([track_id])[0]

    def get_recommendations(self, seed_tracks=None, seed_artists=None, seed_genres=None, limit=20):
        """Get Spotify's recommendations"""
        if not self.sp:
            return None

        return self.sp.recommendations(
            seed_tracks=seed_tracks,
            seed_artists=seed_artists,
            seed_genres=seed_genres,
            limit=limit
        )

    def enrich_dataset(self, songs_df, batch_size=50):
        """Enrich existing dataset with Spotify data"""
        if not self.sp:
            print("⚠️  Spotify client not initialized")
            return songs_df

        enriched_songs = []

        for i in range(0, len(songs_df), batch_size):
            batch = songs_df.iloc[i:i+batch_size]

            for _, song in batch.iterrows():
                try:
                    # Search for song
                    result = self.search_song(song['name'], song.get('artist'))

                    if result:
                        # Get audio features
                        features = self.get_audio_features(result['id'])

                        if features:
                            song_enriched = song.copy()
                            song_enriched['spotify_id'] = result['id']
                            song_enriched['popularity'] = result['popularity']

                            # Update audio features
                            for key in ['danceability', 'energy', 'valence', 'tempo',
                                      'acousticness', 'instrumentalness', 'liveness']:
                                if key in features:
                                    song_enriched[key] = features[key]

                            enriched_songs.append(song_enriched)

                except Exception as e:
                    print(f"Error enriching {song['name']}: {e}")
                    continue

        return pd.DataFrame(enriched_songs)


class UltimateRecommendationSystem:
    """
    The Ultimate Music Recommendation System combining all features
    """

    def __init__(self):
        self.scaler = StandardScaler()
        self.popularity_scaler = MinMaxScaler()
        self.similarity_matrix = None
        self.songs_df = None
        self.user_item_matrix = None
        self.svd_model = None
        self.ncf_model = None
        self.mood_analyzer = MoodAnalyzer()
        self.temporal_recommender = TemporalRecommender()
        self.ab_testing = ABTestingFramework()
        self.spotify_api = None
        self.user_encoder = LabelEncoder()
        self.song_encoder = LabelEncoder()

        print("🎵 Ultimate Music Recommendation System Initialized")
        print(f"   • Deep Learning: {'✓' if DEEP_LEARNING_AVAILABLE else '✗'}")
        print(f"   • Spotify API: {'✓' if SPOTIFY_API_AVAILABLE else '✗'}")

    def initialize_spotify(self, client_id, client_secret):
        """Initialize Spotify API integration"""
        self.spotify_api = SpotifyIntegration(client_id, client_secret)
        print("✓ Spotify API connected")

    def load_data(self, songs_path, listening_history_path=None):
        """Load and preprocess data"""
        self.songs_df = pd.read_csv(songs_path)

        # Preprocess
        self.songs_df = self._preprocess_songs()

        # Add mood classifications
        self._classify_moods()

        if listening_history_path:
            self.listening_history = pd.read_csv(listening_history_path)
            self.listening_history = self._preprocess_listening_history()

            # Update trending scores
            self.temporal_recommender.update_trending(self.listening_history)
        else:
            self.listening_history = None

        print(f"\n✓ Loaded {len(self.songs_df):,} songs")
        if self.listening_history is not None:
            print(f"✓ Loaded {len(self.listening_history):,} listening records")
            print(f"✓ Found {self.listening_history['user_id'].nunique():,} users")

    def _preprocess_songs(self):
        """Preprocess song data"""
        df = self.songs_df.copy()

        # Handle missing values
        df['artist'] = df['artist'].fillna('Unknown Artist')

        numeric_cols = ['danceability', 'energy', 'loudness', 'speechiness',
                       'acousticness', 'instrumentalness', 'liveness',
                       'valence', 'tempo', 'duration_ms']

        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(df[col].median())

        if 'popularity' not in df.columns:
            df['popularity'] = 50

        df['popularity_normalized'] = self.popularity_scaler.fit_transform(df[['popularity']])

        if 'genre' not in df.columns and 'genres' in df.columns:
            df['genre'] = df['genres']

        if 'genre' in df.columns:
            df['genre'] = df['genre'].fillna('Unknown')

        return df

    def _preprocess_listening_history(self):
        """Preprocess listening history"""
        df = self.listening_history.copy()

        if 'play_count' not in df.columns:
            df['play_count'] = 1

        df = df.groupby(['user_id', 'song_id'])['play_count'].sum().reset_index()

        valid_songs = set(self.songs_df['song_id'])
        df = df[df['song_id'].isin(valid_songs)]

        return df

    def _classify_moods(self):
        """Classify mood for each song"""
        moods = []
        mood_vectors = []

        for _, song in self.songs_df.iterrows():
            features = {
                'valence': song.get('valence', 0.5),
                'energy': song.get('energy', 0.5),
                'danceability': song.get('danceability', 0.5),
                'acousticness': song.get('acousticness', 0.5),
                'instrumentalness': song.get('instrumentalness', 0.5),
                'speechiness': song.get('speechiness', 0.5),
                'tempo': song.get('tempo', 120)
            }

            mood, score = self.mood_analyzer.detect_mood(features)
            mood_vec = self.mood_analyzer.get_mood_vector(features)

            moods.append(mood)
            mood_vectors.append(mood_vec)

        self.songs_df['primary_mood'] = moods
        self.songs_df['mood_vector'] = mood_vectors

    def build_all_models(self, use_deep_learning=True):
        """Build all recommendation models"""
        print("\n🔨 Building All Models...")

        # 1. Content-based
        self._build_content_model()

        # 2. Collaborative filtering
        if self.listening_history is not None:
            self._build_collaborative_model()

            # 3. Deep learning (if available)
            if use_deep_learning and DEEP_LEARNING_AVAILABLE:
                self._build_deep_learning_model()

        print("\n✅ All models built successfully!")

    def _build_content_model(self):
        """Build content-based model"""
        print("   Building content-based model...")

        feature_cols = ['danceability', 'energy', 'valence', 'tempo',
                       'acousticness', 'instrumentalness', 'liveness',
                       'loudness', 'speechiness']

        available = [c for c in feature_cols if c in self.songs_df.columns]
        features = self.songs_df[available].fillna(0).values
        features_scaled = self.scaler.fit_transform(features)

        self.similarity_matrix = cosine_similarity(features_scaled)
        print(f"   ✓ Content model ready ({self.similarity_matrix.shape})")

    def _build_collaborative_model(self):
        """Build collaborative filtering model"""
        print("   Building collaborative filtering model...")

        # Create user-item matrix
        user_ids = self.listening_history['user_id'].astype('category')
        song_ids = self.listening_history['song_id'].astype('category')

        user_indices = user_ids.cat.codes
        song_indices = song_ids.cat.codes
        play_counts = np.log1p(self.listening_history['play_count'].values)

        n_users = len(user_ids.cat.categories)
        n_songs = len(song_ids.cat.categories)

        sparse_matrix = csr_matrix(
            (play_counts, (user_indices, song_indices)),
            shape=(n_users, n_songs)
        )

        self.user_item_matrix = pd.DataFrame.sparse.from_spmatrix(
            sparse_matrix,
            index=list(user_ids.cat.categories),
            columns=list(song_ids.cat.categories)
        )

        # SVD
        n_components = min(100, min(sparse_matrix.shape) - 1)
        self.svd_model = TruncatedSVD(n_components=n_components, random_state=42)
        self.user_factors = self.svd_model.fit_transform(sparse_matrix)
        self.item_factors = self.svd_model.components_.T

        print(f"   ✓ Collaborative model ready (SVD with {n_components} components)")

    def _build_deep_learning_model(self, epochs=5):
        """Build neural collaborative filtering model"""
        print("   Building deep learning model...")

        # Prepare data
        users = self.listening_history['user_id'].values
        songs = self.listening_history['song_id'].values

        self.user_encoder.fit(users)
        self.song_encoder.fit(songs)

        user_ids_encoded = self.user_encoder.transform(users)
        song_ids_encoded = self.song_encoder.transform(songs)

        # Create ratings (normalized play counts)
        ratings = self.listening_history['play_count'].values
        ratings = (ratings - ratings.min()) / (ratings.max() - ratings.min())

        # Initialize NCF
        n_users = len(self.user_encoder.classes_)
        n_items = len(self.song_encoder.classes_)

        self.ncf_model = NeuralCollaborativeFiltering(
            n_users=n_users,
            n_items=n_items,
            embedding_dim=50,
            hidden_layers=[128, 64, 32]
        )

        # Train model
        train_data = {
            'user_ids': user_ids_encoded,
            'item_ids': song_ids_encoded,
            'ratings': ratings
        }

        self.ncf_model.train(train_data, epochs=epochs, batch_size=256)
        print(f"   ✓ Deep learning model trained ({epochs} epochs)")

    def recommend_smart(self, user_id=None, song_name=None, mood=None,
                       time_aware=True, n_recommendations=10):
        """
        Ultimate smart recommendations using all available signals

        Args:
            user_id: User ID for personalization
            song_name: Seed song for content-based
            mood: Desired mood ('happy', 'sad', 'energetic', etc.)
            time_aware: Consider time of day
            n_recommendations: Number of recommendations
        """
        all_scores = pd.DataFrame()
        all_scores['song_id'] = self.songs_df['song_id']
        all_scores['base_score'] = 0.0

        # 1. Content-based recommendations
        if song_name and self.similarity_matrix is not None:
            content_scores = self._get_content_scores(song_name, n_recommendations * 3)
            all_scores = all_scores.merge(
                content_scores[['song_id', 'similarity_score']],
                on='song_id',
                how='left'
            )
            all_scores['similarity_score'] = all_scores['similarity_score'].fillna(0)
            all_scores['base_score'] += all_scores['similarity_score'] * 0.35

        # 2. Collaborative filtering
        if user_id and self.svd_model is not None:
            collab_scores = self._get_collaborative_scores(user_id, n_recommendations * 3)
            if collab_scores is not None:
                all_scores = all_scores.merge(
                    collab_scores[['song_id', 'collab_score']],
                    on='song_id',
                    how='left'
                )
                all_scores['collab_score'] = all_scores['collab_score'].fillna(0)
                all_scores['base_score'] += all_scores['collab_score'] * 0.25

        # 3. Deep learning predictions
        if user_id and self.ncf_model is not None:
            dl_scores = self._get_deep_learning_scores(user_id, n_recommendations * 3)
            if dl_scores is not None:
                all_scores = all_scores.merge(
                    dl_scores[['song_id', 'dl_score']],
                    on='song_id',
                    how='left'
                )
                all_scores['dl_score'] = all_scores['dl_score'].fillna(0)
                all_scores['base_score'] += all_scores['dl_score'] * 0.20

        # 4. Mood filtering
        if mood:
            all_scores = all_scores.merge(
                self.songs_df[['song_id', 'primary_mood', 'mood_vector']],
                on='song_id',
                how='left'
            )

            # Boost songs matching the mood
            mood_boost = all_scores.apply(
                lambda x: x['mood_vector'].get(mood, 0) if isinstance(x['mood_vector'], dict) else 0,
                axis=1
            )
            all_scores['base_score'] += mood_boost * 0.15

        # 5. Trending boost
        trending_boost = all_scores['song_id'].map(
            self.temporal_recommender.trending_scores
        ).fillna(0)
        all_scores['base_score'] += trending_boost * 0.10

        # 6. Time-of-day adjustment
        if time_aware:
            current_hour = datetime.now().hour
            time_appropriate = self.temporal_recommender.get_time_appropriate_songs(
                self.songs_df,
                current_hour
            )
            time_boost = all_scores['song_id'].isin(time_appropriate['song_id']).astype(float)
            all_scores['base_score'] += time_boost * 0.05

        # Merge with song details
        final_scores = all_scores.merge(
            self.songs_df[['song_id', 'name', 'artist', 'genre', 'popularity', 'primary_mood']],
            on='song_id',
            how='left'
        )

        # Remove already listened songs (if user_id provided)
        if user_id and self.listening_history is not None:
            listened = self.listening_history[
                self.listening_history['user_id'] == user_id
            ]['song_id'].values
            final_scores = final_scores[~final_scores['song_id'].isin(listened)]

        # Sort and return top N
        final_scores = final_scores.sort_values('base_score', ascending=False).head(n_recommendations)
        final_scores['recommendation_strength'] = (final_scores['base_score'] * 100).round(1)

        return final_scores[['name', 'artist', 'genre', 'primary_mood',
                           'recommendation_strength', 'popularity']].reset_index(drop=True)

    def _get_content_scores(self, song_name, n_songs):
        """Get content-based similarity scores"""
        matches = self.songs_df[
            self.songs_df['name'].str.contains(song_name, case=False, na=False)
        ]

        if matches.empty:
            return pd.DataFrame(columns=['song_id', 'similarity_score'])

        song_idx = matches.index[0]
        similarity_scores = self.similarity_matrix[song_idx]

        top_indices = np.argsort(similarity_scores)[-n_songs:][::-1]

        result = self.songs_df.iloc[top_indices][['song_id']].copy()
        result['similarity_score'] = similarity_scores[top_indices]

        return result

    def _get_collaborative_scores(self, user_id, n_songs):
        """Get collaborative filtering scores"""
        if user_id not in self.user_item_matrix.index:
            return None

        user_idx = list(self.user_item_matrix.index).index(user_id)
        user_ratings = np.dot(self.user_factors[user_idx], self.item_factors.T)

        top_indices = np.argsort(user_ratings)[-n_songs:][::-1]
        recommended_song_ids = [self.user_item_matrix.columns[i] for i in top_indices]

        result = pd.DataFrame({
            'song_id': recommended_song_ids,
            'collab_score': user_ratings[top_indices]
        })

        # Normalize scores
        if result['collab_score'].max() > 0:
            result['collab_score'] = result['collab_score'] / result['collab_score'].max()

        return result

    def _get_deep_learning_scores(self, user_id, n_songs):
        """Get deep learning model predictions"""
        try:
            user_encoded = self.user_encoder.transform([user_id])[0]
        except:
            return None

        # Predict for all songs
        all_song_ids = self.song_encoder.classes_
        song_indices = np.arange(len(all_song_ids))
        user_array = np.full(len(song_indices), user_encoded)

        predictions = self.ncf_model.predict(user_array, song_indices).flatten()

        top_indices = np.argsort(predictions)[-n_songs:][::-1]

        result = pd.DataFrame({
            'song_id': all_song_ids[top_indices],
            'dl_score': predictions[top_indices]
        })

        return result

    def generate_mood_playlist(self, mood, duration_minutes=60, time_aware=True):
        """Generate a mood-based playlist"""
        playlist = PlaylistGenerator.create_mood_playlist(
            self.songs_df,
            mood,
            duration_minutes
        )

        if time_aware:
            # Filter by time appropriateness
            current_hour = datetime.now().hour
            time_appropriate = self.temporal_recommender.get_time_appropriate_songs(
                playlist,
                current_hour
            )
            if not time_appropriate.empty:
                playlist = time_appropriate

        return playlist[['name', 'artist', 'genre', 'primary_mood', 'duration_ms']].reset_index(drop=True)

    def generate_workout_playlist(self, intensity='medium', duration_minutes=45):
        """Generate workout playlist"""
        playlist = PlaylistGenerator.create_workout_playlist(
            self.songs_df,
            duration_minutes,
            intensity
        )

        return playlist[['name', 'artist', 'energy', 'tempo', 'duration_ms']].reset_index(drop=True)

    def get_trending_songs(self, n_songs=50, genre=None):
        """Get currently trending songs"""
        trending = self.temporal_recommender.get_trending_songs(self.songs_df, n_songs * 2)

        if genre:
            trending = trending[
                trending['genre'].str.contains(genre, case=False, na=False)
            ]

        return trending.head(n_songs)[['name', 'artist', 'genre', 'popularity',
                                      'trending_score']].reset_index(drop=True)

    def create_ab_test(self, test_name):
        """Create A/B test for recommendation algorithms"""
        variants = {
            'content_only': lambda user, song: self._get_content_scores(song, 10),
            'collaborative_only': lambda user, song: self._get_collaborative_scores(user, 10),
            'hybrid': lambda user, song: self.recommend_smart(user, song, n_recommendations=10),
            'mood_enhanced': lambda user, song: self.recommend_smart(user, song, mood='happy', n_recommendations=10)
        }

        self.ab_testing.create_experiment(test_name, variants)
        print(f"✓ A/B test '{test_name}' created with {len(variants)} variants")

    def get_ab_test_results(self, test_name):
        """Get A/B test results"""
        return self.ab_testing.get_results(test_name)

    def analyze_user_taste(self, user_id):
        """Deep analysis of user's musical taste"""
        if self.listening_history is None:
            return "No listening history available"

        user_songs = self.listening_history[
            self.listening_history['user_id'] == user_id
        ].merge(self.songs_df, on='song_id')

        if user_songs.empty:
            return f"No data for user {user_id}"

        # Calculate statistics
        analysis = {
            'listening_stats': {
                'total_plays': user_songs['play_count'].sum(),
                'unique_songs': len(user_songs),
                'unique_artists': user_songs['artist'].nunique(),
            },
            'top_artists': user_songs.groupby('artist')['play_count'].sum().nlargest(10).to_dict(),
            'top_genres': user_songs.groupby('genre')['play_count'].sum().nlargest(5).to_dict() if 'genre' in user_songs.columns else {},
            'mood_preferences': user_songs['primary_mood'].value_counts().to_dict(),
            'audio_profile': {
                'avg_energy': user_songs['energy'].mean() if 'energy' in user_songs.columns else 0,
                'avg_valence': user_songs['valence'].mean() if 'valence' in user_songs.columns else 0,
                'avg_danceability': user_songs['danceability'].mean() if 'danceability' in user_songs.columns else 0,
                'avg_tempo': user_songs['tempo'].mean() if 'tempo' in user_songs.columns else 0,
            },
            'diversity_score': user_songs['artist'].nunique() / len(user_songs) if len(user_songs) > 0 else 0,
        }

        return analysis

    def get_similar_users(self, user_id, n_users=10):
        """Find users with similar taste"""
        if self.user_item_matrix is None:
            return "Collaborative model not built"

        if user_id not in self.user_item_matrix.index:
            return f"User {user_id} not found"

        user_idx = list(self.user_item_matrix.index).index(user_id)
        user_vector = self.user_factors[user_idx]

        # Calculate similarity with all users
        similarities = np.dot(self.user_factors, user_vector)

        # Get top similar users (excluding self)
        top_indices = np.argsort(similarities)[-(n_users+1):-1][::-1]
        similar_user_ids = [self.user_item_matrix.index[i] for i in top_indices]
        similarity_scores = similarities[top_indices]

        return pd.DataFrame({
            'user_id': similar_user_ids,
            'similarity': similarity_scores
        })

    def discover_new_music(self, user_id, exploration_factor=0.7, n_recommendations=10):
        """
        Recommend new music for discovery (balance exploration vs exploitation)

        Args:
            user_id: User ID
            exploration_factor: 0-1, higher = more diverse/unexpected recommendations
            n_recommendations: Number of recommendations
        """
        # Get user's listening history
        if self.listening_history is not None:
            user_songs = self.listening_history[
                self.listening_history['user_id'] == user_id
            ]['song_id'].values
            user_genres = self.songs_df[
                self.songs_df['song_id'].isin(user_songs)
            ]['genre'].unique()
        else:
            user_songs = []
            user_genres = []

        # Get recommendations
        candidates = self.recommend_smart(user_id=user_id, n_recommendations=n_recommendations * 5)

        # Add exploration score
        candidates['exploration_score'] = 0.0

        # Boost songs from new genres
        if len(user_genres) > 0:
            new_genre_mask = ~candidates['genre'].isin(user_genres)
            candidates.loc[new_genre_mask, 'exploration_score'] += 0.5

        # Boost less popular songs
        popularity_penalty = 1 - (candidates['popularity'] / 100)
        candidates['exploration_score'] += popularity_penalty * 0.3

        # Combine exploitation (recommendation_strength) and exploration
        candidates['final_score'] = (
            candidates['recommendation_strength'] * (1 - exploration_factor) +
            candidates['exploration_score'] * 100 * exploration_factor
        )

        # Sort and return
        result = candidates.sort_values('final_score', ascending=False).head(n_recommendations)
        return result[['name', 'artist', 'genre', 'primary_mood',
                      'final_score', 'popularity']].reset_index(drop=True)

    def create_radio_station(self, seed_song_name, n_songs=50):
        """Create a radio station based on a seed song"""
        # Find seed song
        seed_match = self.songs_df[
            self.songs_df['name'].str.contains(seed_song_name, case=False, na=False)
        ]

        if seed_match.empty:
            return f"Song '{seed_song_name}' not found"

        seed_song = seed_match.iloc[0]

        # Get similar songs
        radio_songs = [seed_song]
        used_songs = {seed_song['song_id']}
        used_artists = {seed_song['artist']}

        current_song = seed_song

        for i in range(n_songs - 1):
            # Get similar songs to current song
            similar = self.recommend_smart(
                song_name=current_song['name'],
                n_recommendations=20
            )

            # Filter out used songs and apply diversity
            similar_df = similar.merge(
                self.songs_df[['name', 'artist', 'song_id', 'genre']],
                on='name',
                how='left'
            )

            # Prefer new artists every few songs
            if i % 3 == 0:
                similar_df = similar_df[~similar_df['artist'].isin(used_artists)]

            similar_df = similar_df[~similar_df['song_id'].isin(used_songs)]

            if similar_df.empty:
                break

            # Pick next song
            next_song_data = similar_df.iloc[0]
            next_song = self.songs_df[
                self.songs_df['song_id'] == next_song_data['song_id']
            ].iloc[0]

            radio_songs.append(next_song)
            used_songs.add(next_song['song_id'])
            used_artists.add(next_song['artist'])
            current_song = next_song

        playlist = pd.DataFrame(radio_songs)
        return playlist[['name', 'artist', 'genre', 'primary_mood', 'popularity']].reset_index(drop=True)

    def save_model(self, filepath='ultimate_recommender.pkl'):
        """Save the entire model"""
        model_data = {
            'similarity_matrix': self.similarity_matrix,
            'songs_df': self.songs_df,
            'scaler': self.scaler,
            'svd_model': self.svd_model,
            'user_factors': getattr(self, 'user_factors', None),
            'item_factors': getattr(self, 'item_factors', None),
            'user_item_matrix': self.user_item_matrix,
            'temporal_recommender': self.temporal_recommender,
            'user_encoder': self.user_encoder,
            'song_encoder': self.song_encoder,
        }

        with open(filepath, 'wb') as f:
            pickle.dump(model_data, f)

        # Save deep learning model separately if it exists
        if self.ncf_model and self.ncf_model.model:
            self.ncf_model.model.save(filepath.replace('.pkl', '_ncf.h5'))

        print(f"✓ Model saved to {filepath}")

    def load_model(self, filepath='ultimate_recommender.pkl'):
        """Load saved model"""
        with open(filepath, 'rb') as f:
            model_data = pickle.load(f)

        self.similarity_matrix = model_data['similarity_matrix']
        self.songs_df = model_data['songs_df']
        self.scaler = model_data['scaler']
        self.svd_model = model_data['svd_model']
        self.user_factors = model_data['user_factors']
        self.item_factors = model_data['item_factors']
        self.user_item_matrix = model_data['user_item_matrix']
        self.temporal_recommender = model_data['temporal_recommender']
        self.user_encoder = model_data['user_encoder']
        self.song_encoder = model_data['song_encoder']

        # Load deep learning model if exists
        try:
            if DEEP_LEARNING_AVAILABLE:
                ncf_path = filepath.replace('.pkl', '_ncf.h5')
                self.ncf_model = NeuralCollaborativeFiltering(
                    n_users=len(self.user_encoder.classes_),
                    n_items=len(self.song_encoder.classes_)
                )
                self.ncf_model.model = keras.models.load_model(ncf_path)
        except:
            pass

        print(f"✓ Model loaded from {filepath}")

def recommend_by_genre(self, genre, n_recommendations=10):
        """Get top songs from a specific genre"""
        if 'genre' not in self.songs_df.columns:
            return "Genre information not available"

        genre_songs = self.songs_df[
            self.songs_df['genre'].str.contains(genre, case=False, na=False)
        ].copy()

        if genre_songs.empty:
            return f"No songs found for genre: {genre}"

        # Sort by popularity
        genre_songs = genre_songs.sort_values('popularity', ascending=False).head(n_recommendations)
        return genre_songs[['name', 'artist', 'genre', 'popularity']].reset_index(drop=True)
# ==================== USAGE EXAMPLES ====================

if __name__ == "__main__":
    print("\n" + "="*70)
    print("🎵 ULTIMATE MUSIC RECOMMENDATION SYSTEM")
    print("="*70)

    # Initialize system
    recommender = UltimateRecommendationSystem()

    # Optional: Initialize Spotify API
    # recommender.initialize_spotify(
    #     client_id='YOUR_CLIENT_ID',
    #     client_secret='YOUR_CLIENT_SECRET'
    # )

    try:
        # Load data
        print("\n📥 Loading Data...")
        recommender.load_data(
            songs_path='spotify_songs.csv',
            listening_history_path='user_listening_history.csv'
        )

        # Build all models
        recommender.build_all_models(use_deep_learning=True)

        # ============ DEMO: Different Recommendation Types ============

        # 1. Smart Recommendations (combines everything)
        print("\n" + "="*70)
        print("🎯 SMART RECOMMENDATIONS (Multi-signal)")
        print("="*70)
        smart_recs = recommender.recommend_smart(
            user_id=12345,
            song_name='Blinding Lights',
            mood='energetic',
            time_aware=True,
            n_recommendations=5
        )
        print(smart_recs.to_string(index=False))

        # 2. Mood-based Playlist
        print("\n" + "="*70)
        print("😊 MOOD PLAYLIST - Happy Vibes")
        print("="*70)
        mood_playlist = recommender.generate_mood_playlist(
            mood='happy',
            duration_minutes=30
        )
        print(mood_playlist.head(10).to_string(index=False))

        # 3. Workout Playlist
        print("\n" + "="*70)
        print("💪 WORKOUT PLAYLIST - High Intensity")
        print("="*70)
        workout_playlist = recommender.generate_workout_playlist(
            intensity='high',
            duration_minutes=45
        )
        print(workout_playlist.head(10).to_string(index=False))

        # 4. Trending Songs
        print("\n" + "="*70)
        print("🔥 TRENDING SONGS")
        print("="*70)
        trending = recommender.get_trending_songs(n_songs=10, genre='pop')
        print(trending.to_string(index=False))

        # 5. Music Discovery (Exploration)
        print("\n" + "="*70)
        print("🔍 DISCOVER NEW MUSIC")
        print("="*70)
        discovery = recommender.discover_new_music(
            user_id=12345,
            exploration_factor=0.8,
            n_recommendations=5
        )
        print(discovery.to_string(index=False))

        # 6. Radio Station
        print("\n" + "="*70)
        print("📻 RADIO STATION - Based on 'Shape of You'")
        print("="*70)
        radio = recommender.create_radio_station('Shape of You', n_songs=10)
        print(radio.to_string(index=False))

        # 7. User Taste Analysis
        print("\n" + "="*70)
        print("👤 USER TASTE ANALYSIS")
        print("="*70)
        taste_analysis = recommender.analyze_user_taste(user_id=12345)
        print(json.dumps(taste_analysis, indent=2))

        # 8. Similar Users
        print("\n" + "="*70)
        print("🤝 USERS WITH SIMILAR TASTE")
        print("="*70)
        similar_users = recommender.get_similar_users(user_id=12345, n_users=5)
        print(similar_users.to_string(index=False))

        # 9. Create A/B Test
        print("\n" + "="*70)
        print("🧪 A/B TESTING SETUP")
        print("="*70)
        recommender.create_ab_test('recommendation_algorithm_test')

        # Save model
        print("\n💾 Saving model...")
        recommender.save_model('my_ultimate_recommender.pkl')

        print("\n" + "="*70)
        print("✅ ALL DEMOS COMPLETED SUCCESSFULLY!")
        print("="*70)

    except FileNotFoundError:
        print("\n⚠️  Dataset files not found!")
        print("\n📚 SETUP INSTRUCTIONS:")
        print("="*70)
        print("1. Download Spotify Dataset:")
        print("   https://www.kaggle.com/datasets/vatsalmavani/spotify-dataset")
        print("\n2. Save as 'spotify_songs.csv' with these columns:")
        print("   song_id, name, artist, popularity, danceability, energy,")
        print("   valence, tempo, acousticness, etc.")
        print("\n3. (Optional) Create 'user_listening_history.csv' with:")
        print("   user_id, song_id, play_count, timestamp")
        print("\n4. Install dependencies:")
        print("   pip install pandas numpy scikit-learn tensorflow spotipy")
        print("="*70)

    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
