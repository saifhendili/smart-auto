import jwt from 'jsonwebtoken';
import User from '../models/User.js';

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role, nom: user.nom }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

export async function register(req, res, next) {
  try {
    const { nom, email, password } = req.body;
    if (!nom || !email || !password) {
      return res.status(400).json({ message: 'nom, email et password sont requis.' });
    }
    if (await User.findOne({ email })) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé.' });
    }
    const user = await User.create({ nom, email, password });
    return res.status(201).json({ token: signToken(user), user: { id: user._id, nom, email, role: user.role } });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Identifiants invalides.' });
    }
    return res.json({
      token: signToken(user),
      user: { id: user._id, nom: user.nom, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
}
