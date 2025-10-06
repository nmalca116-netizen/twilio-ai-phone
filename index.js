const express = require('express');
const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;

const app = express();
app.use(express.urlencoded({ extended: false }));

// Store conversations temporarily
const conversations = new Map();

// Incoming call
app.post('/voice', async (req, res) => {
  const twiml = new VoiceResponse();
  const callSid = req.body.CallSid;

  if (!conversations.has(callSid)) {
    conversations.set(callSid, []);
    
    const gather = twiml.gather({
      input: 'speech',
      action: '/process',
      speechTimeout: 'auto',
      language: 'en-US'
    });
    
    gather.say('Hello! Thanks for calling. How can I help you today?');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Process speech
app.post('/process', async (req, res) => {
  const twiml = new VoiceResponse();
  const userSpeech = req.body.SpeechResult;
  const callSid = req.body.CallSid;

  if (!userSpeech) {
    twiml.say("I didn't catch that. Please repeat.");
    twiml.redirect('/voice');
    res.type('text/xml');
    res.send(twiml.toString());
    return;
  }

  const history = conversations.get(callSid) || [];
  history.push({ role: 'user', content: userSpeech });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: 'You are a helpful phone assistant. Keep responses brief and conversational.',
        messages: history
      })
    });

    const data = await response.json();
    const aiResponse = data.content[0].text;

    history.push({ role: 'assistant', content: aiResponse });
    conversations.set(callSid, history);

    const gather = twiml.gather({
      input: 'speech',
      action: '/process',
      speechTimeout: 'auto',
      language: 'en-US'
    });
    
    gather.say(aiResponse);
    twiml.redirect('/voice');

  } catch (error) {
    console.error('Error:', error);
    twiml.say("I'm having trouble. Please try again later.");
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 
