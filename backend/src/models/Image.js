import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    apartmentCode: {
      type: String,
      default: "",
      trim: true,
    },
    saleName: {
      type: String,
      default: "",
      trim: true,
    },
    apartmentType: {
      type: String,
      default: "",
      trim: true,
    },
    apartmentCondition: {
      type: String,
      default: "",
      trim: true,
    },
    price: {
      type: String,
      default: "",
      trim: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    embedding: {
      type: [Number],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model("Image", imageSchema);
