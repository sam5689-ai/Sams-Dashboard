// Pulls in any tasks created from WhatsApp messages (queued server-side by
// api/whatsapp-webhook.js since the message can arrive while no browser tab
// is open). No connection/auth needed here — it's a same-origin fetch, and
// the WhatsApp side is authenticated separately via the webhook's own
// verify token.
const WhatsAppSync = {
  async check() {
    try {
      const res = await fetch('/api/pending-tasks');
      if (!res.ok) return;
      const data = await res.json();
      const tasks = data.tasks || [];
      if (!tasks.length) return;

      tasks.forEach((t) => {
        if (t.contactPhone) Contacts.upsert({ name: t.contactName, phone: t.contactPhone });
        Store.add('tasks', t);
      });
      Tasks.render();
      App.refreshOverview();
      Toast.show(`Imported ${tasks.length} task${tasks.length === 1 ? '' : 's'} from WhatsApp`);
    } catch (err) {
      console.warn('WhatsApp pending-task check failed', err);
    }
  },
};
