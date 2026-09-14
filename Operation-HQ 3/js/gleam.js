// gleam.js — private, evidence-based social confidence practice for Operation HQ.
// Built-in lessons and simulations are original, deterministic and offline.
// The optional local model sees only text the person explicitly submits.

const GleamHQ = {
  KEY: "hq_gleam_v1",
  VERSION: 1,
  initialized: false,
  selectedLesson: null,
  selectedQuizAnswer: null,
  quizPassed: false,
  scenarioSession: null,
  scenarioBusy: false,
  missionBusy: false,
  missionDraftTimer: null,
  saveChain: Promise.resolve(),
  data: null,

  skills: [
    { id: "conversation", label: "Conversation", short: "Open, continue, and exit naturally", glyph: "CO" },
    { id: "listening", label: "Listening", short: "Notice, reflect, and follow up", glyph: "LI" },
    { id: "confidence", label: "Clarity", short: "Say the point without shrinking it", glyph: "CL" },
    { id: "assertiveness", label: "Assertiveness", short: "Respectful boundaries and disagreement", glyph: "AS" },
    { id: "teamwork", label: "Teamwork", short: "Contribute, include, and coordinate", glyph: "TW" },
    { id: "speaking", label: "Speaking", short: "Interviews, explanations, and presentations", glyph: "SP" },
  ],

  lessons: [
    { id:"open-context", skill:"conversation", level:1, minutes:4, title:"Open from shared context", summary:"Start with what both people can already see.", principle:"A contextual opener creates less pressure than trying to sound impressive.", method:["Notice one shared detail.","Make a neutral observation.","Add an easy question that can be answered in one sentence."], example:"“That last question was rough. How did you approach it?”", field:"Use one context-based opener today.", quiz:{ question:"Which opener gives the other person the easiest path in?", options:["Tell me something interesting.","This queue is moving slowly—have you been here before?","Why are you so quiet?"], correct:1, explanation:"It uses shared context and an easy, non-invasive question." } },
    { id:"thread-not-interview", skill:"conversation", level:2, minutes:5, title:"Build a thread, not an interview", summary:"Balance questions with small pieces of yourself.", principle:"Back-to-back questions can feel like an interview. A small relevant share gives the other person material to respond to.", method:["Ask one open question.","Listen for one detail.","Respond to that detail and share one connected sentence."], example:"“You play basketball? I started practising again recently—what position do you usually play?”", field:"Use the ask–share–follow-up pattern once.", quiz:{ question:"What best keeps a conversation balanced?", options:["Ask five prepared questions.","Wait for them to carry it.","Ask, share something relevant, then follow the thread."], correct:2, explanation:"Good conversation has mutual contribution and follows what was actually said." } },
    { id:"clean-exit", skill:"conversation", level:2, minutes:4, title:"Exit without making it weird", summary:"End cleanly instead of waiting for a perfect final line.", principle:"A warm, direct exit protects the interaction from fading into an awkward silence.", method:["Signal that you are leaving.","Name something positive or useful.","Close with a simple next point if genuine."], example:"“Good talking with you—I’m heading to class. I’ll see you at training.”", field:"Practise one clear conversation exit.", quiz:{ question:"Which exit is clearest and warmest?", options:["Disappear while they are speaking.","Anyway…", "Good talking with you—I need to head off, but I’ll see you tomorrow."], correct:2, explanation:"It signals the end, stays respectful, and does not invent a promise." } },
    { id:"reflect-content", skill:"listening", level:1, minutes:4, title:"Reflect the actual point", summary:"Prove you heard the meaning before adding your view.", principle:"Listening becomes visible when you briefly reflect the other person’s main point.", method:["Identify the main fact or concern.","Reflect it in your own words.","Ask whether you understood correctly."], example:"“So the issue isn’t the workload—it’s that nobody agreed who owns each part. Is that right?”", field:"Reflect one person’s point before replying.", quiz:{ question:"What is a useful reflection?", options:["Repeating every word exactly.","Summarising the main meaning and checking it.","Immediately giving advice."], correct:1, explanation:"A short paraphrase plus a check shows attention without pretending certainty." } },
    { id:"followup-detail", skill:"listening", level:2, minutes:4, title:"Follow the meaningful detail", summary:"Ask about the detail with the most energy or importance.", principle:"People usually signal what matters through emphasis, repetition, or emotion.", method:["Notice what they emphasise.","Choose one detail instead of changing topics.","Ask a specific open follow-up."], example:"“You said the final round changed everything—what happened?”", field:"Ask one follow-up about a detail they emphasised.", quiz:{ question:"Someone says their match was fine but the final minute was chaotic. What follows best?", options:["Do you like sport?","What happened in that final minute?","Cool. My day was busy."], correct:1, explanation:"It follows their strongest detail instead of restarting the topic." } },
    { id:"validate-before-fix", skill:"listening", level:3, minutes:5, title:"Validate before fixing", summary:"Understand first; solve only when useful.", principle:"Advice lands better after the person feels understood and when they actually want help.", method:["Name the difficulty without exaggerating.","Ask whether they want listening or ideas.","Offer one next step only if invited."], example:"“That sounds frustrating. Do you want to vent, or work out what to do next?”", field:"Ask one person what kind of support they want.", quiz:{ question:"What should usually happen before advice?", options:["A quick judgement.","Validation and checking what support they want.","A longer story about yourself."], correct:1, explanation:"It respects their need and reduces unwanted problem-solving." } },
    { id:"point-reason-next", skill:"confidence", level:1, minutes:4, title:"Point → reason → next step", summary:"Give your message a visible spine.", principle:"Confidence is easier to hear when the listener can follow the structure.", method:["State the point in one sentence.","Give the strongest reason.","Name the next step or question."], example:"“I think we should test the prototype today because the due date is close. Can we split the test cases now?”", field:"Use point–reason–next step in one real explanation.", quiz:{ question:"Which structure is clearest?", options:["Background, more background, maybe a point.","Point, strongest reason, next step.","Apology, disclaimer, point, apology."], correct:1, explanation:"The listener receives the purpose early and knows what happens next." } },
    { id:"remove-shrinking", skill:"confidence", level:2, minutes:4, title:"Remove unnecessary shrinking", summary:"Keep politeness; delete the apology fog.", principle:"Words such as “sorry, this is probably stupid” weaken a useful contribution before anyone evaluates it.", method:["Keep genuine apologies.","Remove apologies for speaking or asking a reasonable question.","Replace vague hedges with a calm qualifier when uncertainty is real."], example:"Instead of “Sorry, this might be dumb,” try “I see one risk with that approach.”", field:"Catch and replace one unnecessary apology.", quiz:{ question:"Which sentence is confident without pretending certainty?", options:["This is definitely perfect.","Sorry, ignore me, but maybe…","I may be missing context, but I see one risk."], correct:2, explanation:"It names real uncertainty without dismissing the speaker’s own point." } },
    { id:"pause-delivery", skill:"speaking", level:1, minutes:4, title:"Use the deliberate pause", summary:"A short pause improves control more than rushing.", principle:"Pausing before the first sentence and between ideas gives both speaker and listener processing room.", method:["Exhale once before beginning.","Deliver one complete idea.","Pause at punctuation instead of filling silence."], example:"“My recommendation is option two. [pause] It solves the timing problem without increasing cost.”", field:"Use one deliberate two-second pause before answering.", quiz:{ question:"What is the purpose of a deliberate pause?", options:["To appear mysterious.","To create processing space and reduce rushing.","To make every answer longer."], correct:1, explanation:"The pause supports clear delivery; it is not a performance trick." } },
    { id:"answer-bridge", skill:"speaking", level:2, minutes:5, title:"Answer, evidence, bridge", summary:"Handle interview or presentation questions without rambling.", principle:"A direct answer followed by one piece of evidence is stronger than searching aloud for every thought.", method:["Answer the question first.","Give one example or reason.","Bridge back to the main point or next action."], example:"“Yes. In our last project I organised the testing checklist, which cut missed cases. I’d use the same approach here.”", field:"Practise one 30-second answer with this structure.", quiz:{ question:"What comes first in a strong answer?", options:["Every detail you remember.","A direct response to the question.","A joke to buy time."], correct:1, explanation:"Directness helps the listener orient before the supporting evidence." } },
    { id:"calm-boundary", skill:"assertiveness", level:1, minutes:5, title:"Set a calm boundary", summary:"Say what you can and cannot do without attacking.", principle:"A boundary is clearest when it names the limit and, where possible, a workable alternative.", method:["State the relevant fact.","Name the limit with “I can” or “I can’t”.","Offer one realistic alternative if you genuinely have one."], example:"“I can help for twenty minutes, but I can’t complete that section for you. I can show you how I approached mine.”", field:"Write one boundary you may need this week.", quiz:{ question:"Which boundary is clearest?", options:["Whatever, fine.","You always take advantage of me.","I can review it, but I can’t do the work for you."], correct:2, explanation:"It names the limit without attacking or surrendering it." } },
    { id:"disagree-curiously", skill:"assertiveness", level:2, minutes:5, title:"Disagree with curiosity", summary:"Challenge the idea while keeping the person in the conversation.", principle:"A useful disagreement separates the person from the proposal and makes the competing reason visible.", method:["Acknowledge the part that makes sense.","Name your concern specifically.","Ask a question or propose a test."], example:"“I see why speed matters. I’m concerned we’ll miss the rubric requirement—could we test both versions against it?”", field:"Use acknowledge–concern–question once.", quiz:{ question:"Which response challenges an idea constructively?", options:["That’s a terrible idea.","Sure, whatever.","I see the time benefit; I’m worried about accuracy. Can we test it first?"], correct:2, explanation:"It preserves respect while making the disagreement actionable." } },
    { id:"invite-voices", skill:"teamwork", level:1, minutes:4, title:"Bring another voice in", summary:"Make a group smarter without dominating it.", principle:"Inviting a quieter or relevant perspective improves information flow and signals shared ownership.", method:["Notice who has relevant context.","Invite without putting them on the spot.","Connect their contribution back to the decision."], example:"“We haven’t heard the design side yet—Alex, is there anything you’d add?”", field:"Invite one relevant person into a group discussion.", quiz:{ question:"What makes an invitation useful?", options:["Calling on someone to embarrass them.","Inviting relevant input without demanding a perfect answer.","Speaking for them."], correct:1, explanation:"A low-pressure invitation creates room without turning attention into a trap." } },
    { id:"group-decision", skill:"teamwork", level:2, minutes:5, title:"Turn discussion into ownership", summary:"End a group conversation with names, actions, and timing.", principle:"Teams lose momentum when agreement is not translated into responsibility.", method:["Summarise the decision.","Confirm who owns each action.","Name the next check-in or deadline."], example:"“We’re using option B. I’ll draft the slides, Sam will check sources, and we’ll review at lunch tomorrow.”", field:"Close one group discussion with an owner and next check.", quiz:{ question:"What prevents a group decision from evaporating?", options:["More discussion.","Clear owners and a next check.","Assuming everyone remembers."], correct:1, explanation:"Ownership and timing convert agreement into execution." } },
    { id:"check-interpretation", skill:"listening", level:3, minutes:5, title:"Check—do not mind-read", summary:"Separate what you observed from what you assume it means.", principle:"Tone and body language can offer clues, but they do not prove intent. A tentative check is more accurate and respectful than a confident guess.", method:["Name the words or behaviour you actually noticed.","Offer your interpretation as a possibility, not a fact.","Ask a neutral check question and accept the correction."], example:"“You got quiet after that change—are you concerned about it, or just thinking it through?”", field:"Replace one assumption with a neutral check question.", quiz:{ question:"Which response avoids mind-reading?", options:["I know you are angry with me.","You paused after that suggestion—did something about it concern you?","Your face proves you disagree."], correct:1, explanation:"It names an observation, keeps the interpretation tentative, and asks." } },
    { id:"repair-quickly", skill:"conversation", level:3, minutes:4, title:"Repair a small social miss", summary:"Acknowledge, correct, and return the floor.", principle:"A concise repair usually works better than defending the mistake or turning the apology into a performance.", method:["Name what you did without exaggerating.","Correct it in one sentence.","Return attention or choice to the other person."], example:"“I interrupted you—sorry. Finish your point.”", field:"Use one short repair the next time you interrupt or misunderstand.", quiz:{ question:"What makes a repair useful?", options:["A long explanation of why it was not your fault.","Ignoring the moment.","Acknowledge it, correct it, and return the floor."], correct:2, explanation:"The repair owns the impact without taking over the interaction." } },
    { id:"negotiate-interests", skill:"assertiveness", level:3, minutes:6, title:"Negotiate the constraint, not the person", summary:"Find the need behind each position and build testable options.", principle:"Negotiation improves when both sides can see the constraints instead of fighting over fixed demands.", method:["State your non-negotiable constraint.","Ask what the other person most needs.","Offer two workable options and test them against both needs."], example:"“I need enough time to check accuracy. Do you mainly need it by lunch, or as early as possible? I can send a draft at eleven or a checked version at one.”", field:"Turn one small disagreement into two concrete options.", quiz:{ question:"Which move opens a fair negotiation?", options:["Repeat your demand louder.","Hide your real constraint.","Name your constraint, ask theirs, and compare workable options."], correct:2, explanation:"Visible needs and options make trade-offs discussable." } },
    { id:"feedback-specific", skill:"teamwork", level:3, minutes:5, title:"Make feedback usable", summary:"Describe behaviour, impact, and the next useful change.", principle:"Specific feedback is easier to act on than a judgement about someone’s character or talent.", method:["Name the observable behaviour or result.","Explain its practical impact.","Ask for or suggest one next adjustment."], example:"“The sources are strong, but two slides do not cite them yet. Could we add the citations before the review?”", field:"Ask for one specific piece of feedback or give one actionable note.", quiz:{ question:"Which feedback is most usable?", options:["You are careless.","This is bad.","Two claims need citations; adding them before review will make the argument checkable."], correct:2, explanation:"It stays observable, explains the impact, and points to a next action." } },
  ],

  missions: [
    { id:"context-opener", skill:"conversation", level:"light", minutes:3, title:"One contextual opener", description:"Start one short conversation using something you both can already see or are doing.", proof:"Record the opener and whether it created a next exchange." },
    { id:"name-followup", skill:"conversation", level:"balanced", minutes:5, title:"Follow one thread", description:"Ask one open question, share one related sentence, then follow a detail from their answer.", proof:"Record the detail you followed." },
    { id:"warm-exit", skill:"conversation", level:"light", minutes:2, title:"Clean exit rep", description:"End one conversation with a clear, warm sentence instead of letting it fade awkwardly.", proof:"Record the exit line you used." },
    { id:"reflect-point", skill:"listening", level:"light", minutes:3, title:"Reflect before replying", description:"Briefly paraphrase someone’s main point and check you understood before adding your view.", proof:"Record what you reflected and whether they corrected it." },
    { id:"meaningful-followup", skill:"listening", level:"balanced", minutes:4, title:"Follow the important detail", description:"Notice one detail someone emphasises and ask a specific open follow-up about it.", proof:"Record the detail and question." },
    { id:"support-choice", skill:"listening", level:"stretch", minutes:5, title:"Ask what support helps", description:"When someone describes a difficulty, ask whether they want listening, ideas, or practical help.", proof:"Record which kind of support they chose." },
    { id:"clear-contribution", skill:"confidence", level:"light", minutes:3, title:"State one useful point", description:"Contribute one idea using point → reason → next step, without an unnecessary apology.", proof:"Record your three-part message." },
    { id:"ask-clearly", skill:"confidence", level:"balanced", minutes:4, title:"Make one clear request", description:"Ask for something reasonable using a direct sentence, a short reason, and a specific next action.", proof:"Record the request and response." },
    { id:"answer-30", skill:"speaking", level:"balanced", minutes:5, title:"Thirty-second answer", description:"Rehearse and deliver one answer using answer → evidence → bridge, with one deliberate pause.", proof:"Record the question and your strongest evidence." },
    { id:"question-after-speaking", skill:"speaking", level:"stretch", minutes:6, title:"Take one live question", description:"After explaining something, invite one question and answer it directly before adding evidence.", proof:"Record the question and your first sentence." },
    { id:"small-boundary", skill:"assertiveness", level:"balanced", minutes:4, title:"Hold one small boundary", description:"State one genuine limit calmly and offer a realistic alternative only if you have one.", proof:"Record the limit—not private details." },
    { id:"constructive-disagree", skill:"assertiveness", level:"stretch", minutes:6, title:"Disagree without heat", description:"Acknowledge one valid point, state your concern, and propose a question or test.", proof:"Record the concern and proposed test." },
    { id:"invite-input", skill:"teamwork", level:"light", minutes:3, title:"Invite a useful voice", description:"Ask one person with relevant context for their view without putting them under pressure.", proof:"Record what their input changed or clarified." },
    { id:"assign-owner", skill:"teamwork", level:"balanced", minutes:5, title:"Create clear ownership", description:"Close one group discussion by confirming the action, owner, and next check-in.", proof:"Record the agreed action and check-in." },
    { id:"check-not-guess", skill:"listening", level:"balanced", minutes:4, title:"Check one interpretation", description:"When you notice a change in words, tone, or behaviour, ask a neutral check question instead of deciding what it means.", proof:"Record the observation, your check question, and what you learned." },
    { id:"repair-one-miss", skill:"conversation", level:"light", minutes:2, title:"Make one clean repair", description:"If you interrupt, misunderstand, or phrase something poorly, acknowledge it briefly, correct it, and return the floor.", proof:"Record the repair line and whether the conversation could continue." },
    { id:"two-options", skill:"assertiveness", level:"stretch", minutes:6, title:"Build two fair options", description:"In one small conflict, name your constraint, ask theirs, and suggest two options that respect both.", proof:"Record the two constraints and the option chosen—or what remains unresolved." },
    { id:"usable-feedback", skill:"teamwork", level:"balanced", minutes:5, title:"Ask for usable feedback", description:"Ask for one specific improvement to a draft, explanation, or contribution instead of asking whether it is simply good or bad.", proof:"Record the question and the actionable detail you received." },
  ],

  scenarios: [
    { id:"new-classmate", skill:"conversation", level:"starter", title:"A new classmate before class", setup:"You are both waiting outside the same classroom. They are looking at the worksheet.", rounds:[
      { role:"Classmate", prompt:"They glance at the worksheet and say, “I’m not sure what we’re meant to finish.”", choices:[
        { text:"“Same—the last instruction is unclear. Do you think it means questions one to six?”", score:2, feedback:"Shared context, small self-disclosure, and an easy specific question." },
        { text:"“What school did you come from?”", score:1, feedback:"It can work, but it ignores the live context and jumps personal quickly." },
        { text:"“Yeah.”", score:0, feedback:"It agrees but gives the conversation nowhere to go." }]},
      { role:"Classmate", prompt:"They say, “I think it’s one to six. Science isn’t really my thing.”", choices:[
        { text:"“Why not?”", score:1, feedback:"Open, but slightly blunt. A specific detail would make it warmer." },
        { text:"“Fair. I like the experiments more than the written parts—what subjects are you into?”", score:2, feedback:"Relevant share plus an open follow-up creates a balanced thread." },
        { text:"“I’m really good at science.”", score:0, feedback:"It redirects to status and misses their opening." }]},
      { role:"Classmate", prompt:"The classroom door opens and everyone starts moving.", choices:[
        { text:"Say nothing and rush in.", score:0, feedback:"Safe, but it drops a simple chance to close warmly." },
        { text:"“Good talking—want to compare answers after class?”", score:2, feedback:"Clear exit with a genuine, low-pressure next point." },
        { text:"“Follow me.”", score:1, feedback:"Direct, but it assumes more familiarity than the moment has earned." }]}
    ]},
    { id:"group-project", skill:"teamwork", level:"core", title:"A drifting group project", setup:"Your group has discussed ideas for ten minutes, but nobody owns the next action.", rounds:[
      { role:"Teammate", prompt:"“We could keep researching, or maybe start the slides.”", choices:[
        { text:"“Let’s just do something.”", score:0, feedback:"It adds urgency without creating clarity." },
        { text:"“The rubric needs evidence and analysis. Could we choose the argument first, then split sources and slides?”", score:2, feedback:"It anchors the choice to a requirement and proposes sequence." },
        { text:"“I’ll do all of it.”", score:0, feedback:"It creates dependence and removes shared ownership." }]},
      { role:"Teammate", prompt:"One person has not spoken yet but researched the topic yesterday.", choices:[
        { text:"“You did research—what did you find that could shape the argument?”", score:2, feedback:"Relevant, low-pressure invitation that improves the decision." },
        { text:"Ignore them so the group moves faster.", score:0, feedback:"The group loses relevant information and shared ownership." },
        { text:"“Why aren’t you saying anything?”", score:1, feedback:"It invites them, but turns the spotlight into pressure." }]},
      { role:"Group", prompt:"Everyone agrees on the argument, but the bell is about to go.", choices:[
        { text:"“Cool, see you.”", score:0, feedback:"Agreement has no owner or timing." },
        { text:"“I’ll outline slides one to three, Mia checks sources, and we review tomorrow at lunch—does that work?”", score:2, feedback:"Decision, owners, timing, and a final consent check." },
        { text:"Create a group chat and hope people organise themselves.", score:1, feedback:"A channel helps, but it does not replace ownership." }]}
    ]},
    { id:"teacher-help", skill:"confidence", level:"starter", title:"Ask a teacher for useful help", setup:"You understand the topic but cannot see why your answer lost marks.", rounds:[
      { role:"Teacher", prompt:"“What part are you stuck on?”", choices:[
        { text:"“Everything.”", score:0, feedback:"It is honest but too broad for targeted help." },
        { text:"“I can calculate it, but my explanation lost marks. Could you show me which reasoning step is missing?”", score:2, feedback:"Specific gap, evidence of effort, and a clear request." },
        { text:"“Never mind.”", score:0, feedback:"It avoids the reasonable request you came to make." }]},
      { role:"Teacher", prompt:"They explain quickly, but one sentence is still unclear.", choices:[
        { text:"Pretend it makes sense.", score:0, feedback:"It protects the moment but not your understanding." },
        { text:"“So the evidence has to connect back to the judgement—is that the step I missed?”", score:2, feedback:"You paraphrase and check the exact gap." },
        { text:"“Can you explain everything again?”", score:1, feedback:"A repeat may help, but a targeted check is more efficient." }]},
      { role:"Teacher", prompt:"You now understand the correction.", choices:[
        { text:"“Thanks—that connection was what I was missing. I’ll redo the paragraph.”", score:2, feedback:"Confirms learning and the next action clearly." },
        { text:"Leave immediately.", score:0, feedback:"You miss a simple close and confirmation." },
        { text:"Ask for the answer to the next question.", score:1, feedback:"It shifts from learning the method toward answer collection." }]}
    ]},
    { id:"team-disagreement", skill:"assertiveness", level:"core", title:"Disagree with a teammate", setup:"A teammate wants to skip testing because the deadline is close.", rounds:[
      { role:"Teammate", prompt:"“Testing will take too long. Let’s submit it now.”", choices:[
        { text:"“That’s reckless.”", score:0, feedback:"It attacks the person and makes defence more likely." },
        { text:"“I get the timing problem. I’m worried one failure could cost more time—can we run the three critical tests?”", score:2, feedback:"Acknowledgement, specific concern, and a bounded proposal." },
        { text:"“Fine.”", score:0, feedback:"It hides the concern instead of resolving it." }]},
      { role:"Teammate", prompt:"“We only have fifteen minutes.”", choices:[
        { text:"“Then let’s use ten for the critical tests and five to submit. I can run the first two.”", score:2, feedback:"You adapt to the constraint and offer ownership." },
        { text:"“You never care about quality.”", score:0, feedback:"A general accusation escalates and does not solve timing." },
        { text:"“Maybe we could test if you want.”", score:1, feedback:"The idea is useful, but the hedge makes the proposal hard to act on." }]},
      { role:"Teammate", prompt:"They agree to the three-test plan.", choices:[
        { text:"“Good. I’ll run tests one and two; can you run three and prepare the submission?”", score:2, feedback:"Clear ownership turns agreement into action." },
        { text:"Start testing without confirming roles.", score:1, feedback:"Action starts, but duplication or missed work is still possible." },
        { text:"“I told you testing was better.”", score:0, feedback:"Winning the argument adds friction after the decision is solved." }]}
    ]},
    { id:"presentation-question", skill:"speaking", level:"core", title:"A difficult presentation question", setup:"You finish a presentation and someone asks about a weakness in your evidence.", rounds:[
      { role:"Audience", prompt:"“How do you know that source is reliable?”", choices:[
        { text:"Start listing every source you used.", score:1, feedback:"Evidence matters, but the direct answer gets buried." },
        { text:"“I checked the author, publication, date, and whether other credible sources agreed. Its limitation is the small sample.”", score:2, feedback:"Direct answer, criteria, and an honest limitation." },
        { text:"“It just is.”", score:0, feedback:"Confidence without evidence does not answer the question." }]},
      { role:"Audience", prompt:"“Doesn’t that limitation weaken your conclusion?”", choices:[
        { text:"“Yes, it narrows how strongly I can generalise, but it still supports the trend alongside the other sources.”", score:2, feedback:"Acknowledges the limitation and bridges to the bounded claim." },
        { text:"“No.”", score:0, feedback:"It rejects the issue without reasoning." },
        { text:"Apologise repeatedly for the source.", score:0, feedback:"The useful move is to define the limitation, not collapse the whole argument." }]},
      { role:"Audience", prompt:"They nod and wait for your final sentence.", choices:[
        { text:"“So my conclusion is supported, but it should be read within that sample limit.”", score:2, feedback:"Concise bridge back to the exact strength of the conclusion." },
        { text:"Repeat the full presentation.", score:0, feedback:"The question is already answered; repetition weakens the close." },
        { text:"“Any other questions?”", score:1, feedback:"A workable close, though one summary sentence would land the answer better." }]}
    ]},
    { id:"work-shift", skill:"listening", level:"core", title:"A coworker explains a problem", setup:"During a shift, a coworker says the handover system keeps causing repeated work.", rounds:[
      { role:"Coworker", prompt:"“I keep marking the same work because the handover notes are unclear.”", choices:[
        { text:"“So the main issue is not the marking—it’s knowing what was already completed?”", score:2, feedback:"Reflects the core problem and checks it." },
        { text:"“That happens.”", score:0, feedback:"It acknowledges but does not show understanding or move forward." },
        { text:"Immediately explain your own frustrations.", score:1, feedback:"Shared experience can connect, but first reflect their point." }]},
      { role:"Coworker", prompt:"“Exactly. I waste the first ten minutes checking everything.”", choices:[
        { text:"“Which detail is usually missing from the notes?”", score:2, feedback:"Specific follow-up targets the process failure." },
        { text:"“Why don’t you work faster?”", score:0, feedback:"It blames the person instead of investigating the system." },
        { text:"“Want me to fix it?”", score:1, feedback:"Helpful intent, but the actual gap is not understood yet." }]},
      { role:"Coworker", prompt:"They say the missing detail is the last completed page.", choices:[
        { text:"“Would a one-line ‘last page completed’ field solve most of it? We could test that today.”", score:2, feedback:"Checks a small solution rather than imposing it." },
        { text:"“Easy, I’ll tell everyone.”", score:1, feedback:"Actionable, but it skips checking whether the solution fits." },
        { text:"“Not my problem.”", score:0, feedback:"It ends collaboration despite a low-cost shared fix." }]}
    ]},
    { id:"deadline-tradeoff", skill:"assertiveness", level:"advanced", title:"A deadline trade-off", setup:"A teammate wants your shared section early, but you need time to check the evidence accurately.", rounds:[
      { role:"Teammate", prompt:"“Can you send the finished section by ten? I want to assemble everything before lunch.”", choices:[
        { text:"“No, that is impossible.”", score:0, feedback:"It names a limit but gives no context or path forward." },
        { text:"“I need until one for a checked version. Do you need the final wording by ten, or enough structure to start assembling?”", score:2, feedback:"States the constraint and asks which underlying need matters." },
        { text:"“Sure,” even though you know it will not be ready.", score:0, feedback:"Agreeing to an unrealistic deadline hides the conflict instead of solving it." }]},
      { role:"Teammate", prompt:"“I mostly need the headings and evidence order so I can build the layout.”", choices:[
        { text:"“I can send the headings and evidence order at ten, then the checked wording at one. Would that unblock you?”", score:2, feedback:"Offers a testable option that respects both constraints." },
        { text:"“Then just wait until one.”", score:1, feedback:"It protects accuracy but overlooks a low-cost way to unblock the layout." },
        { text:"“Why did you not say that earlier?”", score:0, feedback:"It shifts toward blame after the useful need has become clear." }]},
      { role:"Teammate", prompt:"“That works. Send the outline at ten and final copy at one.”", choices:[
        { text:"“Done: outline by ten, checked copy by one. I’ll message if the evidence creates a delay.”", score:2, feedback:"Confirms both commitments and the condition that could change them." },
        { text:"“Okay.”", score:1, feedback:"Agreement is present, but repeating the two deliverables would prevent drift." },
        { text:"Add extra promises you may not be able to keep.", score:0, feedback:"A good agreement stays realistic and specific." }]}
    ]},
    { id:"conversation-repair", skill:"conversation", level:"core", title:"Repair after interrupting", setup:"You cut off a classmate while they are explaining their project idea.", rounds:[
      { role:"Classmate", prompt:"They stop mid-sentence after you speak over them.", choices:[
        { text:"“I interrupted you—sorry. Finish what you were saying.”", score:2, feedback:"Brief ownership, genuine correction, and the floor returns to them." },
        { text:"Keep explaining your point quickly.", score:0, feedback:"It compounds the interruption instead of repairing it." },
        { text:"Give a long explanation about why you were excited.", score:1, feedback:"The intent may be true, but a long defence keeps the floor." }]},
      { role:"Classmate", prompt:"They finish: “I thought the opening could start with the result, then explain how we got there.”", choices:[
        { text:"“So you want the result first to hook attention, then the method—have I got that right?”", score:2, feedback:"Reflects their recovered point and checks the meaning." },
        { text:"“My idea is still better.”", score:0, feedback:"It dismisses the point immediately after returning the floor." },
        { text:"“Right.”", score:1, feedback:"Acknowledges, but does not prove the interrupted idea was heard." }]},
      { role:"Classmate", prompt:"“Exactly. We could test both openings.”", choices:[
        { text:"“Good idea. Let’s read each opening once and choose against the rubric.”", score:2, feedback:"Turns the repaired conversation into a fair next action." },
        { text:"“Fine.”", score:1, feedback:"Accepts the proposal but leaves the test undefined." },
        { text:"Return to debating who had the idea first.", score:0, feedback:"That would undo the repair and shift away from the work." }]}
    ]},
  ],

  emptyData() {
    return { version:this.VERSION, profile:null, settings:{ dailyMinutes:10, intensity:"balanced" }, lessonResults:{}, scenarioAttempts:[], missionHistory:[], rehearsals:[], practiceLog:[], activeMission:null, missionOffset:0 };
  },

  safe(value) {
    const node = document.createElement("span");
    node.textContent = String(value ?? "");
    return node.innerHTML;
  },

  attr(value) {
    return this.safe(value).replace(/"/g, "&quot;");
  },

  dateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  },

  skill(id) {
    return this.skills.find(skill => skill.id === id) || this.skills[0];
  },

  normalise(raw) {
    const base = this.emptyData();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
    const settings = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
    const profile = raw.profile && typeof raw.profile === "object" ? raw.profile : null;
    const skillIds = new Set(this.skills.map(skill => skill.id));
    const text = (value, limit = 600) => String(value ?? "").slice(0,limit);
    const timestamp = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : Date.now();
    const lessonResults = Object.fromEntries(Object.entries(raw.lessonResults && typeof raw.lessonResults === "object" && !Array.isArray(raw.lessonResults) ? raw.lessonResults : {}).filter(([id,result]) => this.lessons.some(lesson => lesson.id === id) && result && typeof result === "object").map(([id,result]) => [id,{ completedAt:timestamp(result.completedAt), attempts:Math.max(1,Math.min(99,Number(result.attempts)||1)) }]));
    const scenarioAttempts = (Array.isArray(raw.scenarioAttempts) ? raw.scenarioAttempts : []).filter(item => item && this.scenarios.some(scenario => scenario.id === item.scenarioId) && skillIds.has(item.skill)).slice(-120).map((item,index) => ({ id:text(item.id || `scenario-${index}-${timestamp(item.at)}`,100), scenarioId:text(item.scenarioId,80), skill:item.skill, score:Math.max(0,Math.min(100,Number(item.score)||0)), at:timestamp(item.at) }));
    const missionHistory = (Array.isArray(raw.missionHistory) ? raw.missionHistory : []).filter(item => item && this.missions.some(mission => mission.id === item.missionId) && skillIds.has(item.skill) && text(item.outcome).trim()).slice(-180).map((item,index) => ({ id:text(item.id || `mission-${index}-${timestamp(item.completedAt)}`,100), missionId:text(item.missionId,80), skill:item.skill, title:text(item.title,120), before:Math.max(1,Math.min(5,Number(item.before)||3)), after:Math.max(1,Math.min(5,Number(item.after)||3)), outcome:text(item.outcome,600), startedAt:timestamp(item.startedAt), completedAt:timestamp(item.completedAt) }));
    const rehearsalGoals = new Set(["connect","ask","present","resolve","interview"]);
    const rehearsals = (Array.isArray(raw.rehearsals) ? raw.rehearsals : []).filter(item => item && text(item.situation,180) && text(item.person,80) && rehearsalGoals.has(item.goal)).slice(-30).map((item,index) => { const clean={ id:text(item.id || `rehearsal-${index}-${timestamp(item.createdAt)}`,100), situation:text(item.situation,180), goal:item.goal, person:text(item.person,80), context:text(item.context,800), createdAt:timestamp(item.createdAt) }; return { ...clean, map:this.rehearsalMap(clean) }; });
    const practiceLog = (Array.isArray(raw.practiceLog) ? raw.practiceLog : []).filter(item => item && skillIds.has(item.skill) && Number.isFinite(Number(item.at))).slice(-300).map((item,index) => ({ id:text(item.id || `practice-${index}-${Number(item.at)}`,100), type:text(item.type,40), skill:item.skill, title:text(item.title,120), at:Number(item.at), ...(Number.isFinite(Number(item.score)) ? { score:Math.max(0,Math.min(100,Number(item.score))) } : {}) }));
    const activeSource = raw.activeMission?.id && this.missions.some(mission => mission.id === raw.activeMission.id) ? raw.activeMission : null;
    const activeMission = activeSource ? { id:activeSource.id, startedAt:timestamp(activeSource.startedAt), draft:{ before:Math.max(1,Math.min(5,Number(activeSource.draft?.before)||3)), after:Math.max(1,Math.min(5,Number(activeSource.draft?.after)||3)), outcome:text(activeSource.draft?.outcome,600) } } : null;
    return {
      ...base,
      version:this.VERSION,
      profile: profile ? { goals:Array.isArray(profile.goals) ? profile.goals.filter(id => this.skills.some(skill => skill.id === id)).slice(0,6) : [], comfort:Math.max(1,Math.min(5,Number(profile.comfort)||3)), createdAt:Number(profile.createdAt)||Date.now() } : null,
      settings:{ dailyMinutes:[5,10,15].includes(Number(settings.dailyMinutes)) ? Number(settings.dailyMinutes) : 10, intensity:["light","balanced","stretch"].includes(settings.intensity) ? settings.intensity : "balanced" },
      lessonResults,
      scenarioAttempts,
      missionHistory,
      rehearsals,
      practiceLog,
      activeMission,
      missionOffset:Math.max(0,Math.min(5000,Number(raw.missionOffset)||0)),
    };
  },

  async load() {
    const saved = await chrome.storage.local.get(this.KEY);
    this.data = this.normalise(saved[this.KEY]);
  },

  async save() {
    this.data.scenarioAttempts = this.data.scenarioAttempts.slice(-120);
    this.data.missionHistory = this.data.missionHistory.slice(-180);
    this.data.rehearsals = this.data.rehearsals.slice(-30);
    this.data.practiceLog = this.data.practiceLog.slice(-300);
    const snapshot=JSON.parse(JSON.stringify(this.data));
    const operation=this.saveChain.catch(()=>{}).then(()=>chrome.storage.local.set({ [this.KEY]:snapshot }));
    this.saveChain=operation;
    await operation;
    this.renderGlobalSignals();
  },

  log(type, skill, title, extra = {}) {
    const entry={ id:crypto.randomUUID(), type, skill, title:String(title).slice(0,120), at:Date.now(), ...extra };
    this.data.practiceLog.push(entry);
    return entry;
  },

  streak() {
    const days = new Set(this.data.practiceLog.map(item => this.dateKey(new Date(item.at))));
    let count = 0;
    const cursor = new Date(); cursor.setHours(12,0,0,0);
    if (!days.has(this.dateKey(cursor))) cursor.setDate(cursor.getDate()-1);
    while (days.has(this.dateKey(cursor))) { count += 1; cursor.setDate(cursor.getDate()-1); }
    return count;
  },

  thisWeekDays() {
    const floor = new Date(); floor.setHours(0,0,0,0); floor.setDate(floor.getDate()-6);
    return new Set(this.data.practiceLog.filter(item => item.at >= floor.getTime()).map(item => this.dateKey(new Date(item.at)))).size;
  },

  countsBySkill() {
    return Object.fromEntries(this.skills.map(skill => [skill.id,this.data.practiceLog.filter(item => item.skill === skill.id).length]));
  },

  practiceCoverage() {
    const counts = Object.values(this.countsBySkill());
    return Math.round(counts.reduce((sum,count) => sum + Math.min(5,count),0) / (this.skills.length * 5) * 100);
  },

  reflectionTrend() {
    const rated = this.data.missionHistory.filter(item => Number.isFinite(item.before) && Number.isFinite(item.after));
    if (!rated.length) return "—";
    const average = rated.reduce((sum,item) => sum + item.after - item.before,0) / rated.length;
    return `${average >= 0 ? "+" : ""}${average.toFixed(1)}`;
  },

  dailyMission() {
    const goals = this.data.profile?.goals?.length ? this.data.profile.goals : this.skills.map(skill => skill.id);
    const intensity = this.data.settings.intensity;
    const allowed = { light:["light"], balanced:["light","balanced"], stretch:["light","balanced","stretch"] }[intensity];
    const counts = this.countsBySkill();
    const leastCount = Math.min(...goals.map(id => counts[id] || 0));
    const focusSkills = goals.filter(id => (counts[id] || 0) === leastCount);
    let pool = this.missions.filter(mission => focusSkills.includes(mission.skill) && allowed.includes(mission.level));
    if (!pool.length) pool = this.missions.filter(mission => goals.includes(mission.skill) && allowed.includes(mission.level));
    if (!pool.length) pool = this.missions.filter(mission => goals.includes(mission.skill));
    const recent = new Set(this.data.missionHistory.slice(-3).map(item => item.missionId));
    const fresh = pool.filter(mission => !recent.has(mission.id));
    if (fresh.length) pool = fresh;
    const dateSeed = [...this.dateKey()].reduce((sum,char) => sum + char.charCodeAt(0),0);
    return pool[(dateSeed + this.data.missionOffset) % pool.length];
  },

  setView(view) {
    const valid = ["home","learn","practice","missions","rehearse","progress","privacy"];
    if (!valid.includes(view)) view = "home";
    document.querySelectorAll(".gleam-view").forEach(panel => {
      const active = panel.dataset.view === view;
      panel.hidden = !active;
      panel.setAttribute("aria-hidden",String(!active));
    });
    document.querySelectorAll(".gleam-nav-btn").forEach(button => {
      const active = button.dataset.gleamView === view;
      button.classList.toggle("active",active);
      button.setAttribute("aria-selected",String(active));
      button.tabIndex = active ? 0 : -1;
    });
    const title = {home:"Today’s social rep",learn:"Micro-curriculum",practice:"Conversation simulator",missions:"Field missions",rehearse:"Conversation rehearsal",progress:"Practice evidence",privacy:"Data control"}[view];
    document.getElementById("gleam-top-focus").textContent = title;
    if (view === "learn") this.renderLessons();
    if (view === "practice") this.renderScenarios();
    if (view === "missions") this.renderMissions();
    if (view === "progress") this.renderProgress();
  },

  renderGlobalSignals() {
    if (!this.data) return;
    const streak = this.streak();
    const streakText = `${streak} day${streak === 1 ? "" : "s"}`;
    document.getElementById("gleam-sidebar-streak").textContent = streakText;
    document.getElementById("gleam-sidebar-next").textContent = streak ? "Consistency is evidence. Keep the next rep small." : "Start with one tiny rep.";
    document.getElementById("gleam-metric-reps").textContent = String(this.data.missionHistory.length);
    document.getElementById("gleam-metric-sessions").textContent = String(Object.keys(this.data.lessonResults).length + this.data.scenarioAttempts.length + this.data.rehearsals.length);
    document.getElementById("gleam-metric-trend").textContent = this.reflectionTrend();
    document.getElementById("gleam-metric-week").textContent = String(this.thisWeekDays());
    const coverage = this.practiceCoverage();
    document.getElementById("gleam-practice-ring").style.setProperty("--gleam-progress",coverage);
    document.getElementById("gleam-practice-percent").textContent = `${coverage}%`;
    const counts = this.countsBySkill();
    const least = [...this.skills].sort((a,b) => counts[a.id]-counts[b.id])[0];
    document.getElementById("gleam-signal-copy").textContent = this.data.practiceLog.length ? `${least.label} has the least recorded practice. That is a coverage signal, not a judgement of ability.` : "No evidence yet. Complete a lesson, simulation, or real-world mission.";
  },

  renderHome() {
    const mission = this.dailyMission();
    const skill = this.skill(mission.skill);
    const sessionExtra = this.data.settings.dailyMinutes >= 15 ? " Add one micro-lesson and one simulator run if time allows." : this.data.settings.dailyMinutes >= 10 ? " Add one micro-lesson if time allows." : " One field rep is enough for today.";
    document.getElementById("gleam-home-copy").textContent = `Your ${this.data.settings.dailyMinutes}-minute target starts with the least-practised selected track.${sessionExtra}`;
    document.getElementById("gleam-daily-mission-card").dataset.level = mission.level;
    document.getElementById("gleam-daily-mission-title").textContent = mission.title;
    document.getElementById("gleam-daily-mission-description").textContent = mission.description;
    document.getElementById("gleam-daily-mission-skill").textContent = skill.label;
    document.getElementById("gleam-daily-mission-level").textContent = mission.level;
    document.getElementById("gleam-daily-mission-time").textContent = `${mission.minutes} min`;
    document.getElementById("gleam-home-skills").innerHTML = this.skills.map(item => {
      const count = this.countsBySkill()[item.id];
      const width = Math.min(100,count*20);
      return `<button data-skill-open="${this.attr(item.id)}"><span class="gleam-skill-glyph">${item.glyph}</span><span><strong>${this.safe(item.label)}</strong><small>${this.safe(item.short)}</small></span><i><b style="width:${width}%"></b></i><em>${count} rep${count===1?"":"s"}</em></button>`;
    }).join("");
    this.renderGlobalSignals();
  },

  renderLessons() {
    const filter = document.getElementById("gleam-lesson-filter").value || "all";
    const lessons = this.lessons.filter(lesson => filter === "all" || lesson.skill === filter);
    document.getElementById("gleam-lesson-list").innerHTML = lessons.map(lesson => {
      const done = !!this.data.lessonResults[lesson.id];
      return `<button class="gleam-library-item${this.selectedLesson===lesson.id?" active":""}" data-lesson-id="${this.attr(lesson.id)}"><span>${this.skill(lesson.skill).glyph}</span><div><strong>${this.safe(lesson.title)}</strong><small>${this.safe(this.skill(lesson.skill).label)} · ${lesson.minutes} min</small></div><em>${done?"Complete":"Open"}</em></button>`;
    }).join("") || '<p class="gleam-empty-copy">No lessons match that track.</p>';
    if (this.selectedLesson) this.renderLessonViewer(this.selectedLesson);
  },

  renderLessonViewer(id) {
    const lesson = this.lessons.find(item => item.id === id);
    if (!lesson) return;
    this.selectedLesson = id;
    const done = !!this.data.lessonResults[id];
    const feedback = this.selectedQuizAnswer == null ? "Choose the strongest response." : this.quizPassed ? lesson.quiz.explanation : "Not quite. Re-read the method and try again.";
    document.getElementById("gleam-lesson-viewer").innerHTML = `<span class="gleam-eyebrow">${this.safe(this.skill(lesson.skill).label)} · Level ${lesson.level} · ${lesson.minutes} min</span><h4>${this.safe(lesson.title)}</h4><p class="gleam-lesson-principle">${this.safe(lesson.principle)}</p><ol class="gleam-method-list">${lesson.method.map(step=>`<li>${this.safe(step)}</li>`).join("")}</ol><div class="gleam-example"><span>Example</span><p>${this.safe(lesson.example)}</p></div><fieldset class="gleam-quiz"><legend>${this.safe(lesson.quiz.question)}</legend>${lesson.quiz.options.map((option,index)=>`<label><input type="radio" name="gleam-lesson-answer" value="${index}"${this.selectedQuizAnswer===index?" checked":""}> ${this.safe(option)}</label>`).join("")}<button data-lesson-action="check" class="gleam-secondary">Check answer</button><p data-state="${this.quizPassed?"success":this.selectedQuizAnswer==null?"idle":"retry"}" role="status">${this.safe(feedback)}</p></fieldset><div class="gleam-field-action"><span>Use it</span><p>${this.safe(lesson.field)}</p></div><button data-lesson-action="complete" class="gleam-primary"${!this.quizPassed||done?" disabled":""}>${done?"Lesson completed":"Complete lesson"}</button>`;
    this.renderLessonsListOnly();
  },

  renderLessonsListOnly() {
    document.querySelectorAll("[data-lesson-id]").forEach(button => button.classList.toggle("active",button.dataset.lessonId===this.selectedLesson));
  },

  checkLesson() {
    const lesson = this.lessons.find(item => item.id === this.selectedLesson);
    const selected = document.querySelector('input[name="gleam-lesson-answer"]:checked');
    if (!lesson || !selected) return;
    this.selectedQuizAnswer = Number(selected.value);
    this.quizPassed = this.selectedQuizAnswer === lesson.quiz.correct;
    this.renderLessonViewer(lesson.id);
  },

  async completeLesson() {
    const lesson = this.lessons.find(item => item.id === this.selectedLesson);
    if (!lesson || !this.quizPassed || this.data.lessonResults[lesson.id]) return;
    this.data.lessonResults[lesson.id] = { completedAt:Date.now(), attempts:1 };
    const logEntry=this.log("lesson",lesson.skill,lesson.title);
    try { await this.save(); }
    catch (error) {
      delete this.data.lessonResults[lesson.id];
      this.data.practiceLog=this.data.practiceLog.filter(item=>item.id!==logEntry.id);
      throw error;
    }
    this.renderHome();
    this.renderLessonViewer(lesson.id);
  },

  renderScenarios() {
    document.getElementById("gleam-scenario-list").innerHTML = this.scenarios.map(scenario => `<button class="gleam-scenario-card${this.scenarioSession?.id===scenario.id?" active":""}" data-scenario-id="${this.attr(scenario.id)}"><span>${this.skill(scenario.skill).glyph}</span><div><strong>${this.safe(scenario.title)}</strong><small>${this.safe(this.skill(scenario.skill).label)} · ${scenario.rounds.length} decisions</small></div><em>${this.safe(scenario.level)}</em></button>`).join("");
    document.getElementById("gleam-practice-reset").disabled = !this.scenarioSession;
    if (this.scenarioSession) this.renderScenarioStage();
    this.refreshAIState();
  },

  startScenario(id) {
    const scenario = this.scenarios.find(item => item.id === id);
    if (!scenario) return;
    this.scenarioSession = { id, index:0, points:0, decisions:[] };
    this.scenarioBusy=false;
    this.renderScenarios();
  },

  renderScenarioStage() {
    const session = this.scenarioSession;
    const scenario = this.scenarios.find(item => item.id === session?.id);
    const stage = document.getElementById("gleam-scenario-stage");
    if (!scenario) return;
    if (session.index >= scenario.rounds.length) {
      const max = scenario.rounds.length*2;
      const percentage = Math.round(session.points/max*100);
      const cue = percentage>=85?"Strong visible cue use":percentage>=55?"Useful base with one weak link":"Retry and focus on the response explanations";
      stage.innerHTML = `<div class="gleam-sim-result"><span class="gleam-eyebrow">Simulation complete</span><div class="gleam-result-orbit" style="--result:${percentage}"><strong>${percentage}%</strong><small>cue alignment</small></div><h4>${this.safe(cue)}</h4><p>This score measures choices against the lesson cues shown in this simulation. It does not measure your personality or predict a real person’s reaction.</p><ul>${session.decisions.map(item=>`<li data-score="${item.score}">${this.safe(item.feedback)}</li>`).join("")}</ul><button data-scenario-action="restart" class="gleam-primary">Run it again</button></div>`;
      return;
    }
    const round = scenario.rounds[session.index];
    stage.innerHTML = `<div class="gleam-sim-head"><span>${this.safe(this.skill(scenario.skill).label)}</span><strong>${session.index+1} / ${scenario.rounds.length}</strong></div>${session.index===0?`<p class="gleam-sim-setup">${this.safe(scenario.setup)}</p>`:""}<div class="gleam-dialogue"><span>${this.safe(round.role)}</span><p>${this.safe(round.prompt)}</p></div><div class="gleam-sim-choices">${round.choices.map((choice,index)=>`<button data-scenario-choice="${index}"><span>${String(index+1).padStart(2,"0")}</span>${this.safe(choice.text)}</button>`).join("")}</div><p class="gleam-sim-note">Choose what you would most likely say—not the answer that merely sounds “perfect.”</p>`;
  },

  async chooseScenario(index) {
    if (this.scenarioBusy) return;
    const session = this.scenarioSession;
    const scenario = this.scenarios.find(item => item.id === session?.id);
    const choice = scenario?.rounds[session.index]?.choices[index];
    if (!choice) return;
    this.scenarioBusy=true;
    document.querySelectorAll("#gleam-scenario-stage [data-scenario-choice]").forEach(button=>{button.disabled=true;});
    session.points += choice.score;
    session.decisions.push({ score:choice.score, feedback:choice.feedback });
    session.index += 1;
    try {
      if (session.index >= scenario.rounds.length) {
        const score = Math.round(session.points/(scenario.rounds.length*2)*100);
        const attempt={ id:crypto.randomUUID(), scenarioId:scenario.id, skill:scenario.skill, score, at:Date.now() };
        this.data.scenarioAttempts.push(attempt);
        const logEntry=this.log("simulation",scenario.skill,scenario.title,{ score });
        try { await this.save(); }
        catch (error) {
          this.data.scenarioAttempts=this.data.scenarioAttempts.filter(item=>item.id!==attempt.id);
          this.data.practiceLog=this.data.practiceLog.filter(item=>item.id!==logEntry.id);
          session.index-=1; session.points-=choice.score; session.decisions.pop();
          throw error;
        }
        this.renderHome();
      }
    } finally {
      this.scenarioBusy=false;
      this.renderScenarioStage();
    }
  },

  responseCues(text, skillId) {
    const value = String(text||"").trim();
    const lower = value.toLowerCase();
    const wordCount = value.split(/\s+/).filter(Boolean).length;
    const questions = (value.match(/\?/g)||[]).length;
    const openQuestion = /\b(what|how|which|tell me|walk me through)\b[^?]*\?/i.test(value);
    const validation = /\b(i hear|i understand|that makes sense|sounds|i see why|fair|so you(?:'re| are)|you mean)\b/i.test(value);
    const ownership = /\b(i can|i can't|i cannot|i need|i think|my concern|i'd prefer|i would prefer)\b/i.test(value);
    const nextStep = /\b(can we|could we|would you|next|let's|how about|what if|by (?:today|tomorrow|monday|tuesday|wednesday|thursday|friday))\b/i.test(value);
    const shrinking = (lower.match(/\b(sorry(?:,|\s)+(?:this|i|if this|to bother)|probably stupid|this (?:might|may) be (?:dumb|stupid)|ignore me|whatever)\b/g)||[]).length;
    const cues = [
      { label:"Specific enough to act on", hit:wordCount>=8 && wordCount<=90, detail:wordCount<8?"Add the key fact or request.":wordCount>90?"Lead with the point and remove extra setup.":"The response has enough context without becoming a speech." },
      { label:"Creates a next move", hit:nextStep||questions>0, detail:nextStep||questions?"A question or next action keeps the interaction moving.":"Add one clear question, request, or next step." },
      { label:"Avoids apology fog", hit:shrinking===0, detail:shrinking?"Remove apologies or shrinking words that are not genuinely needed.":"No obvious self-dismissal cue detected." },
    ];
    const focus = {
      conversation:{ label:"Open or follow-up question", hit:openQuestion, detail:openQuestion?"The question invites more than a yes/no answer.":"Add a specific what/how/which follow-up." },
      listening:{ label:"Visible listening", hit:validation, detail:validation?"The wording reflects or validates before redirecting.":"Reflect the main point before adding advice or your own story." },
      confidence:{ label:"Clear ownership", hit:ownership, detail:ownership?"The response owns a point, need, or limit.":"State your point with ‘I think’, ‘I need’, or another direct ownership phrase." },
      assertiveness:{ label:"Boundary or concern is named", hit:ownership, detail:ownership?"The response states a position without attacking.":"Name your limit or concern directly, then add a workable next step." },
      teamwork:{ label:"Coordinates a next step", hit:nextStep, detail:nextStep?"The wording moves the group toward action.":"Add an owner, action, question, or check-in." },
      speaking:{ label:"Point lands early", hit:wordCount<=55 && /[.!?]/.test(value), detail:wordCount<=55?"The response can land as a focused spoken answer.":"Move the answer to the first sentence and keep one piece of evidence." },
    }[skillId] || null;
    if (focus) cues.unshift(focus);
    const hits = cues.filter(cue=>cue.hit).length;
    return { cues, hits, total:cues.length, next:cues.find(cue=>!cue.hit)?.detail || "The visible cues are present. Practise saying it once without reading." };
  },

  analyseResponse() {
    const text = document.getElementById("gleam-response-input").value.trim();
    if (!text) return this.setResponseOutput("Add the words you might actually say first.","review");
    const result = this.responseCues(text,document.getElementById("gleam-response-skill").value);
    document.getElementById("gleam-response-output").innerHTML = `<div class="gleam-cue-score"><strong>${result.hits}/${result.total}</strong><span>visible cues found</span></div><ul>${result.cues.map(cue=>`<li data-hit="${cue.hit}"><strong>${cue.hit?"Found":"Missing"} · ${this.safe(cue.label)}</strong><span>${this.safe(cue.detail)}</span></li>`).join("")}</ul><p><strong>Next improvement:</strong> ${this.safe(result.next)}</p>`;
  },

  setResponseOutput(message,state="ready") {
    const output = document.getElementById("gleam-response-output");
    output.textContent = message;
    output.dataset.state = state;
  },

  async deepCoach() {
    const input = document.getElementById("gleam-response-input");
    const text = input.value.trim();
    if (!text) return this.setResponseOutput("Add the words you might actually say first.","review");
    if (!LocalAI.isLoadedThisSession()) return this.setResponseOutput("Load Native Intelligence from Settings first. Deterministic cue analysis still works without it.","review");
    const button = document.getElementById("gleam-response-ai");
    button.disabled = true;
    this.setResponseOutput("Local AI is reviewing only the text you submitted…","working");
    try {
      const result = await LocalAI.coachSocial(text,document.getElementById("gleam-response-skill").value);
      this.setResponseOutput(result,"ready");
    } catch (error) {
      this.setResponseOutput(`Local coaching stopped safely: ${error.message}`,"review");
    } finally { this.refreshAIState(); }
  },

  refreshAIState() {
    const button = document.getElementById("gleam-response-ai");
    if (button) button.disabled = !LocalAI?.isLoadedThisSession?.() || LocalAI?.isRunning?.();
  },

  async startMission(id) {
    const mission = this.missions.find(item => item.id === id);
    if (!mission) return;
    if (this.data.activeMission?.id === id) { this.setView("missions"); return; }
    if (this.data.activeMission && !confirm("Replace the active Gleam mission? Its start time and unfinished reflection will be discarded; completed evidence will not change.")) return;
    const previous=this.data.activeMission;
    this.data.activeMission = { id, startedAt:Date.now(), draft:{ before:3, after:3, outcome:"" } };
    try { await this.save(); }
    catch (error) { this.data.activeMission=previous; throw error; }
    document.getElementById("gleam-active-mission").innerHTML="";
    this.setView("missions");
    this.renderMissions();
  },

  renderMissions() {
    this.captureMissionDraft(false);
    const filter = document.getElementById("gleam-mission-filter").value || "all";
    const active = this.missions.find(item => item.id === this.data.activeMission?.id);
    const draft = this.data.activeMission?.draft || { before:3, after:3, outcome:"" };
    const activeCard = document.getElementById("gleam-active-mission");
    activeCard.hidden = !active;
    if (active) activeCard.innerHTML = `<div class="gleam-active-head"><div><span class="gleam-eyebrow">Active field mission · ${this.safe(this.skill(active.skill).label)}</span><h4>${this.safe(active.title)}</h4></div><span>${active.minutes} min · ${this.safe(active.level)}</span></div><p>${this.safe(active.description)}</p><p class="gleam-proof"><strong>Evidence prompt:</strong> ${this.safe(active.proof)}</p><form id="gleam-mission-reflection-form"><div class="gleam-rating-row"><label>Comfort before<select id="gleam-mission-before" aria-label="Comfort before mission">${[1,2,3,4,5].map(value=>`<option value="${value}"${draft.before===value?" selected":""}>${value}</option>`).join("")}</select></label><label>Comfort after<select id="gleam-mission-after" aria-label="Comfort after mission">${[1,2,3,4,5].map(value=>`<option value="${value}"${draft.after===value?" selected":""}>${value}</option>`).join("")}</select></label></div><label>What actually happened<textarea id="gleam-mission-outcome" maxlength="600" rows="3" required aria-label="Mission outcome" placeholder="A short factual reflection—no names or private details needed.">${this.safe(draft.outcome)}</textarea></label><div class="gleam-card-actions"><button type="submit" class="gleam-primary">Complete + record evidence</button><button type="button" data-mission-action="cancel" class="gleam-text-btn">End without completing</button></div><p id="gleam-mission-status" class="gleam-inline-status" role="status" aria-live="polite"></p></form>`;
    const missions = this.missions.filter(mission=>filter==="all"||mission.skill===filter);
    document.getElementById("gleam-mission-library").innerHTML = missions.map(mission=>`<article data-level="${this.attr(mission.level)}"><span>${this.skill(mission.skill).glyph}</span><div><small>${this.safe(this.skill(mission.skill).label)} · ${mission.minutes} min</small><h4>${this.safe(mission.title)}</h4><p>${this.safe(mission.description)}</p></div><button data-mission-start="${this.attr(mission.id)}" class="gleam-secondary"${active?.id===mission.id?" disabled":""}>${active?.id===mission.id?"Active":"Choose"}</button></article>`).join("");
  },

  captureMissionDraft(persist = true) {
    if (!this.data?.activeMission) return;
    const outcome = document.getElementById("gleam-mission-outcome");
    const before = document.getElementById("gleam-mission-before");
    const after = document.getElementById("gleam-mission-after");
    if (!outcome || !before || !after) return;
    this.data.activeMission.draft = { outcome:outcome.value.slice(0,600), before:Number(before.value), after:Number(after.value) };
    if (!persist) return;
    clearTimeout(this.missionDraftTimer);
    this.missionDraftTimer = setTimeout(() => this.save().catch(error => this.reportError(error,"gleam-mission-status")),150);
  },

  async completeMission() {
    if (this.missionBusy) return;
    const mission = this.missions.find(item=>item.id===this.data.activeMission?.id);
    const outcome = document.getElementById("gleam-mission-outcome")?.value.trim();
    const status = document.getElementById("gleam-mission-status");
    if (!mission || !outcome || outcome.length<12) { if(status) status.textContent="Add one short factual reflection so the completion is real evidence."; return; }
    this.missionBusy=true;
    const before = Number(document.getElementById("gleam-mission-before").value);
    const after = Number(document.getElementById("gleam-mission-after").value);
    clearTimeout(this.missionDraftTimer);
    const previous=this.data.activeMission;
    const historyEntry={ id:crypto.randomUUID(), missionId:mission.id, skill:mission.skill, title:mission.title, before, after, outcome:outcome.slice(0,600), startedAt:previous.startedAt, completedAt:Date.now() };
    this.data.missionHistory.push(historyEntry);
    const logEntry=this.log("mission",mission.skill,mission.title,{ before, after });
    this.data.activeMission = null;
    try {
      await this.save();
      this.renderHome();
      this.renderMissions();
    } catch (error) {
      this.data.missionHistory=this.data.missionHistory.filter(item=>item.id!==historyEntry.id);
      this.data.practiceLog=this.data.practiceLog.filter(item=>item.id!==logEntry.id);
      this.data.activeMission=previous;
      throw error;
    } finally { this.missionBusy=false; }
  },

  async cancelMission() {
    if (!this.data.activeMission) return;
    clearTimeout(this.missionDraftTimer);
    const previous=this.data.activeMission;
    this.data.activeMission=null;
    try { await this.save(); this.renderMissions(); }
    catch (error) { this.data.activeMission=previous; throw error; }
  },

  rehearsalMap({situation,goal,person,context}) {
    const openings = {
      connect:`Open from the shared situation: “Hey—${situation.slice(0,70)}. How has it been for you?”`,
      ask:`Lead with the request: “Could I ask you about ${situation.slice(0,70)}?”`,
      present:`Lead with the point: “The main idea I want to explain is…”`,
      resolve:`Start with shared purpose: “I want us to sort out ${situation.slice(0,70)} fairly.”`,
      interview:`Open clearly, then connect your experience to what the ${person} needs.`,
    };
    const cores = {
      connect:"Notice → ask → share one related detail → follow their thread.",
      ask:"Request → short reason → specific next action → space for their response.",
      present:"Point → strongest evidence/example → why it matters → next step.",
      resolve:"Acknowledge → name the specific concern → propose a test or request.",
      interview:"Answer first → one concrete example → result or lesson → bridge back.",
    };
    return {
      opening:openings[goal],
      questions:[`What matters most to the ${person} in this situation?`,`What specific detail would help me understand their view before I respond?`],
      core:cores[goal],
      watch:context ? "Use the supplied context as facts, but do not assume the other person’s motive or reaction." : "Ask for missing context instead of guessing motives.",
      exit:"Close with the agreed next action, a genuine thanks, or a clear respectful exit.",
    };
  },

  async buildRehearsal(event) {
    event.preventDefault();
    const situation = document.getElementById("gleam-rehearse-situation").value.trim();
    const goal = document.getElementById("gleam-rehearse-goal").value;
    const person = document.getElementById("gleam-rehearse-person").value.trim();
    const context = document.getElementById("gleam-rehearse-context").value.trim();
    const status = document.getElementById("gleam-rehearse-status");
    if (!situation||!person) { status.textContent="Add the situation and who you are speaking with."; return; }
    const map = this.rehearsalMap({situation,goal,person,context});
    const rehearsal = { id:crypto.randomUUID(), situation:situation.slice(0,180), goal, person:person.slice(0,80), context:context.slice(0,800), map, createdAt:Date.now() };
    this.data.rehearsals.push(rehearsal);
    const logEntry=this.log("rehearsal",goal==="present"||goal==="interview"?"speaking":goal==="resolve"?"assertiveness":"conversation",situation);
    try { await this.save(); }
    catch (error) {
      this.data.rehearsals=this.data.rehearsals.filter(item=>item.id!==rehearsal.id);
      this.data.practiceLog=this.data.practiceLog.filter(item=>item.id!==logEntry.id);
      throw error;
    }
    this.renderHome();
    this.renderRehearsal(rehearsal);
    status.textContent="Conversation map saved locally.";
  },

  renderRehearsal(rehearsal) {
    document.getElementById("gleam-rehearse-output").innerHTML = `<span class="gleam-eyebrow">Rehearsal map · ${new Date(rehearsal.createdAt).toLocaleString()}</span><h4>${this.safe(rehearsal.situation)}</h4><div class="gleam-blueprint-steps"><section><span>01 · Opening</span><p>${this.safe(rehearsal.map.opening)}</p></section><section><span>02 · Two useful questions</span><ul>${rehearsal.map.questions.map(question=>`<li>${this.safe(question)}</li>`).join("")}</ul></section><section><span>03 · Message spine</span><p>${this.safe(rehearsal.map.core)}</p></section><section><span>04 · Reality check</span><p>${this.safe(rehearsal.map.watch)}</p></section><section><span>05 · Exit</span><p>${this.safe(rehearsal.map.exit)}</p></section></div><button data-rehearsal-copy="${this.attr(rehearsal.id)}" class="gleam-secondary">Copy rehearsal map</button>`;
  },

  rehearsalText(rehearsal) {
    return [`GLEAM REHEARSAL — ${rehearsal.situation}`,`Speaking with: ${rehearsal.person}`,`Opening: ${rehearsal.map.opening}`,`Questions: ${rehearsal.map.questions.join(" | ")}`,`Message spine: ${rehearsal.map.core}`,`Reality check: ${rehearsal.map.watch}`,`Exit: ${rehearsal.map.exit}`].join("\n");
  },

  renderProgress() {
    const streak = this.streak();
    document.getElementById("gleam-progress-summary").innerHTML = `<article><strong>${this.data.practiceLog.length}</strong><span>total practice records</span></article><article><strong>${streak}</strong><span>day current streak</span></article><article><strong>${Object.keys(this.data.lessonResults).length}/${this.lessons.length}</strong><span>lessons complete</span></article><article><strong>${this.data.missionHistory.length}</strong><span>field missions complete</span></article>`;
    const counts = this.countsBySkill();
    const max = Math.max(1,...Object.values(counts));
    document.getElementById("gleam-progress-skills").innerHTML = this.skills.map(skill=>`<div><span>${this.safe(skill.label)}</span><i><b style="width:${Math.round(counts[skill.id]/max*100)}%"></b></i><strong>${counts[skill.id]}</strong></div>`).join("");
    const evidence = [...this.data.practiceLog].sort((a,b)=>b.at-a.at).slice(0,30);
    document.getElementById("gleam-evidence-list").innerHTML = evidence.length ? evidence.map(item=>`<article><span>${this.skill(item.skill).glyph}</span><div><strong>${this.safe(item.title)}</strong><small>${this.safe(item.type)} · ${new Date(item.at).toLocaleDateString([], {weekday:"short",month:"short",day:"numeric"})}${Number.isFinite(item.score)?` · ${item.score}% cue alignment`:""}</small></div></article>`).join("") : '<p class="gleam-empty-copy">No evidence yet. Complete a lesson, simulation, rehearsal, or field mission.</p>';
  },

  async exportData() {
    const blob = new Blob([JSON.stringify({ exportedAt:new Date().toISOString(), module:"Operation HQ Gleam", data:this.data },null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href=url; link.download=`operation-hq-gleam-${this.dateKey()}.json`; link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    document.getElementById("gleam-privacy-status").textContent="Gleam-only JSON export created.";
  },

  async resetData() {
    if (!confirm("Erase all Gleam profile, lesson, simulation, mission, rehearsal and reflection data from this device? This cannot be undone unless you exported it.")) return;
    const previous=this.data;
    this.data=this.emptyData();
    clearTimeout(this.missionDraftTimer);
    this.selectedLesson=null; this.scenarioSession=null;
    try { await this.save(); }
    catch (error) { this.data=previous; throw error; }
    this.renderAll();
    document.getElementById("gleam-privacy-status").textContent="Gleam data erased. Other Operation HQ data was untouched.";
  },

  populateFilters() {
    const options = this.skills.map(skill=>`<option value="${this.attr(skill.id)}">${this.safe(skill.label)}</option>`).join("");
    document.getElementById("gleam-lesson-filter").innerHTML=`<option value="all">All tracks</option>${options}`;
    document.getElementById("gleam-mission-filter").innerHTML=`<option value="all">All skills</option>${options}`;
  },

  async finishOnboarding(event) {
    event.preventDefault();
    const goals = [...document.querySelectorAll('input[name="gleam-goal"]:checked')].map(input=>input.value);
    const status = document.getElementById("gleam-onboarding-status");
    if (!goals.length) { status.textContent="Choose at least one skill you actually want to practise."; return; }
    const previousProfile=this.data.profile;
    const previousSettings={...this.data.settings};
    this.data.profile={ goals, comfort:Number(document.getElementById("gleam-baseline-comfort").value), createdAt:Date.now() };
    this.data.settings.dailyMinutes=Number(document.getElementById("gleam-daily-minutes").value);
    try { await this.save(); }
    catch (error) { this.data.profile=previousProfile; this.data.settings=previousSettings; throw error; }
    this.renderAll();
  },

  renderAll() {
    const onboarded=!!this.data.profile;
    document.getElementById("gleam-onboarding").hidden=onboarded;
    document.querySelector(".gleam-layout").classList.toggle("needs-onboarding",!onboarded);
    document.getElementById("gleam-settings-minutes").value=String(this.data.settings.dailyMinutes);
    document.getElementById("gleam-settings-intensity").value=this.data.settings.intensity;
    document.querySelectorAll(".gleam-settings-goal").forEach(input => { input.checked=this.data.profile?.goals?.includes(input.value) ?? false; });
    this.renderHome(); this.renderLessons(); this.renderScenarios(); this.renderMissions(); this.renderProgress(); this.refreshAIState();
    if (this.data.rehearsals.length) this.renderRehearsal(this.data.rehearsals[this.data.rehearsals.length-1]);
  },

  wire() {
    document.querySelectorAll(".gleam-nav-btn").forEach((button,index,buttons)=>{
      button.onclick=()=>this.setView(button.dataset.gleamView);
      button.onkeydown=event=>{
        const next={ArrowDown:(index+1)%buttons.length,ArrowRight:(index+1)%buttons.length,ArrowUp:(index-1+buttons.length)%buttons.length,ArrowLeft:(index-1+buttons.length)%buttons.length,Home:0,End:buttons.length-1}[event.key];
        if(next===undefined)return; event.preventDefault(); buttons[next].click(); buttons[next].focus();
      };
    });
    document.getElementById("gleam-onboarding-form").onsubmit=event=>this.finishOnboarding(event).catch(error=>document.getElementById("gleam-onboarding-status").textContent=error.message);
    document.getElementById("gleam-home-start").onclick=()=>this.startMission(this.dailyMission().id).catch(error=>this.reportError(error));
    document.getElementById("gleam-daily-mission-start").onclick=()=>this.startMission(this.dailyMission().id).catch(error=>this.reportError(error));
    document.getElementById("gleam-daily-mission-swap").onclick=async()=>{const previous=this.data.missionOffset;this.data.missionOffset=(previous+1)%10000;try{await this.save();this.renderHome();}catch(error){this.data.missionOffset=previous;this.reportError(error);}};
    document.getElementById("gleam-home-open-learn").onclick=()=>this.setView("learn");
    document.getElementById("gleam-home-skills").onclick=event=>{const button=event.target.closest("[data-skill-open]");if(!button)return;document.getElementById("gleam-lesson-filter").value=button.dataset.skillOpen;this.setView("learn");};
    document.getElementById("gleam-lesson-filter").onchange=()=>{this.selectedLesson=null;document.getElementById("gleam-lesson-viewer").innerHTML='<div class="gleam-empty-visual" aria-hidden="true"><i></i><span></span></div><h4>Choose a lesson</h4><p>Each lesson ends with something you can actually try.</p>';this.renderLessons();};
    document.getElementById("gleam-lesson-list").onclick=event=>{const button=event.target.closest("[data-lesson-id]");if(!button)return;this.selectedQuizAnswer=null;this.quizPassed=false;this.renderLessonViewer(button.dataset.lessonId);};
    document.getElementById("gleam-lesson-viewer").onclick=event=>{const button=event.target.closest("[data-lesson-action]");if(!button)return;if(button.dataset.lessonAction==="check")this.checkLesson();if(button.dataset.lessonAction==="complete")this.completeLesson().catch(error=>this.reportError(error));};
    document.getElementById("gleam-scenario-list").onclick=event=>{const button=event.target.closest("[data-scenario-id]");if(button)this.startScenario(button.dataset.scenarioId);};
    document.getElementById("gleam-scenario-stage").onclick=event=>{const choice=event.target.closest("[data-scenario-choice]");if(choice)this.chooseScenario(Number(choice.dataset.scenarioChoice)).catch(error=>this.reportError(error));if(event.target.closest('[data-scenario-action="restart"]')&&this.scenarioSession)this.startScenario(this.scenarioSession.id);};
    document.getElementById("gleam-practice-reset").onclick=()=>{if(this.scenarioSession)this.startScenario(this.scenarioSession.id);};
    document.getElementById("gleam-response-analyse").onclick=()=>this.analyseResponse();
    document.getElementById("gleam-response-ai").onclick=()=>this.deepCoach();
    document.getElementById("gleam-response-clear").onclick=()=>{document.getElementById("gleam-response-input").value="";this.setResponseOutput("Your feedback will show the exact cues it detected and one next improvement.");};
    document.getElementById("gleam-mission-filter").onchange=()=>this.renderMissions();
    document.getElementById("gleam-mission-library").onclick=event=>{const button=event.target.closest("[data-mission-start]");if(button)this.startMission(button.dataset.missionStart).catch(error=>this.reportError(error,"gleam-mission-status"));};
    document.getElementById("gleam-active-mission").oninput=()=>this.captureMissionDraft();
    document.getElementById("gleam-active-mission").onclick=event=>{if(event.target.closest('[data-mission-action="cancel"]'))this.cancelMission().catch(error=>this.reportError(error,"gleam-mission-status"));};
    document.getElementById("gleam-active-mission").onsubmit=event=>{if(event.target.id!=="gleam-mission-reflection-form")return;event.preventDefault();this.completeMission().catch(error=>this.reportError(error,"gleam-mission-status"));};
    document.getElementById("gleam-rehearse-form").onsubmit=event=>this.buildRehearsal(event).catch(error=>this.reportError(error,"gleam-rehearse-status"));
    document.getElementById("gleam-rehearse-output").onclick=async event=>{const button=event.target.closest("[data-rehearsal-copy]");if(!button)return;const rehearsal=this.data.rehearsals.find(item=>item.id===button.dataset.rehearsalCopy);if(!rehearsal)return;try{await navigator.clipboard.writeText(this.rehearsalText(rehearsal));button.textContent="Copied";}catch(error){this.reportError(error,"gleam-rehearse-status");}};
    document.getElementById("gleam-settings-save").onclick=async()=>{const goals=[...document.querySelectorAll(".gleam-settings-goal:checked")].map(input=>input.value);if(!goals.length){document.getElementById("gleam-privacy-status").textContent="Keep at least one focus track selected.";return;}const previousProfile=this.data.profile;const previousSettings={...this.data.settings};this.data.profile={...(this.data.profile||{comfort:3,createdAt:Date.now()}),goals};this.data.settings.dailyMinutes=Number(document.getElementById("gleam-settings-minutes").value);this.data.settings.intensity=document.getElementById("gleam-settings-intensity").value;try{await this.save();this.renderHome();document.getElementById("gleam-privacy-status").textContent="Practice settings saved.";}catch(error){this.data.profile=previousProfile;this.data.settings=previousSettings;this.reportError(error);}};
    document.getElementById("gleam-export").onclick=()=>{try{this.exportData();}catch(error){this.reportError(error);}};
    document.getElementById("gleam-reset").onclick=()=>this.resetData().catch(error=>this.reportError(error));
  },

  reportError(error, targetId = "gleam-privacy-status") {
    console.error("Gleam operation stopped",error);
    const status=document.getElementById(targetId) || document.getElementById("gleam-privacy-status");
    if(status) status.textContent="That action could not be saved. Nothing else was changed; try again.";
  },

  async init() {
    if (this.initialized) { this.renderAll(); return; }
    await this.load();
    this.populateFilters();
    this.wire();
    this.setView("home");
    this.renderAll();
    this.initialized=true;
  },
};
