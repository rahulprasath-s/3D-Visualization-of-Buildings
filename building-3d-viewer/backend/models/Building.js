const mongoose = require('mongoose');

const buildingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  description: { type: String },
  coordinates: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
  },
  floors: { type: Number },
  area: { type: Number },
  yearBuilt: { type: Number },
  modelUrl: { type: String },
  amenities: { type: [String], default: [] },
  contact: {
    phone: String,
    email: String
  }
}, { timestamps: true });

buildingSchema.index({ coordinates: '2dsphere' });

module.exports = mongoose.model('Building', buildingSchema);
