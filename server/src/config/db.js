import mongoose from 'mongoose';

export async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/smart-auto';
  try {
    await mongoose.connect(uri);
    console.log(`✅ MongoDB connecté : ${uri}`);
  } catch (err) {
    console.error('❌ Échec de connexion MongoDB :', err.message);
    process.exit(1);
  }
}
