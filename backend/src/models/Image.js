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
    rentalStatus: {
      type: String,
      default: "chưa cho thuê",
      enum: ["chưa cho thuê", "đã cho thuê"],
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
    isSample: {
      type: Boolean,
      default: false,
    },
    sampleFolder: {
      type: String,
      default: "General",
      trim: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Image", imageSchema);
