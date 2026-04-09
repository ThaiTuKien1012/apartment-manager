export const showToast = (message, type = "success") => {
  const event = new CustomEvent("SHOW_TOAST", { detail: { message, type } });
  window.dispatchEvent(event);
};
