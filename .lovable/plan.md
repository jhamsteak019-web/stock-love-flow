

## Add Emoji Reactions to Team Chat Messages

Currently, the emoji picker only allows adding emojis to the message you're typing. This plan will add the ability to **react to specific messages** with emojis (like Slack, Discord, or Facebook Messenger).

### What You'll Get

- A small emoji button (😊) appears when hovering over any chat message
- Clicking it opens an emoji picker to select a reaction
- Reactions display below the message bubble (e.g., 👍 2, ❤️ 1)
- Clicking an existing reaction toggles it on/off (add/remove your reaction)
- Users can see who reacted by hovering over a reaction

### Technical Implementation

**1. Database Changes**

Create a new `chat_message_reactions` table:
- `id` - Primary key
- `message_id` - Reference to the chat message
- `user_id` - Who reacted
- `emoji` - The emoji character (e.g., "👍")
- `created_at` - Timestamp

Add RLS policies:
- Users can view all reactions (for display)
- Users can insert/delete their own reactions
- Admins can delete any reaction

Enable realtime for instant reaction updates across all users.

**2. Frontend Changes**

Update `TeamChatBox.tsx`:
- Add a Smile button next to Reply/Delete on each message
- Show emoji picker when clicked
- Display reaction counts below each message bubble
- Allow toggling reactions by clicking existing ones
- Subscribe to realtime updates for reactions

### UI Preview

```text
┌─────────────────────────────────────┐
│  [Avatar]  Username   3:45 PM  ↩️  🗑️ 😊 │  ← New emoji button on hover
│  ┌─────────────────────────┐        │
│  │ Message content here... │        │
│  └─────────────────────────┘        │
│    👍 2  ❤️ 1  😂 3                  │  ← Reactions appear below bubble
└─────────────────────────────────────┘
```

