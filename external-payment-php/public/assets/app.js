document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const message = form.dataset.confirm;
  if (message && !window.confirm(message)) {
    event.preventDefault();
  }
});

function submitEpayForm() {
  const epaySubmitForm = document.querySelector('form[data-auto-submit="payment"]');
  if (!(epaySubmitForm instanceof HTMLFormElement)) {
    return;
  }

  window.setTimeout(() => epaySubmitForm.requestSubmit(), 250);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', submitEpayForm, { once: true });
} else {
  submitEpayForm();
}
