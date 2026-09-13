# FormChain health and wellbeing interface review

## Recommendation

Design FormChain as a personal movement journal centered on a recorded set. The primary question is “What happened in my repetitions, and what can I review?” Put the video, repetition count, selected repetition, and a short observation in the first screen. Let people inspect evidence before interpreting it. Use calm, warm surfaces, dark green text, generous type, and restrained motion. These visual choices are a product recommendation, not a scientifically established wellbeing intervention.

The current implementation has three connected problems. Its repeated dark containers and tiny uppercase labels borrow the structure of a developer dashboard. Its dominant numerical score implies a level of validation that the prototype does not have. Its repetition detector treats fast or shallower movements as missing repetitions, making the interface's central feedback incomplete. Correcting only the colors would leave the more important interaction failures intact.

## Evidence and applicability

### Readability comes before decoration

The NHS typography guidance uses 19 px body text on large screens and 16 px on small screens, with smaller styles used sparingly. Its guidance also calls for semantic, consistent headings. FormChain is a consumer fitness prototype, not an NHS service, but the readability principles transfer to people viewing a phone while exercising. Adopt 16–18 px body copy, 14 px supporting labels, clearly larger headings, and generous line spacing. Do not reproduce the NHS brand or imply clinical affiliation. [1]

The NHS writing guidance favors factual, neutral, plain language, explains specialist terms, and cautions against unsupported subjective statements. Apply that to descriptions such as “5 repetitions detected,” “0.4 seconds lowering,” and “Camera angle affects this estimate.” Replace general motivational filler and labels such as “good form” with observations that point to a frame or metric. A front or oblique recording can support repetition timing while providing poor evidence for anatomical squat depth. [2]

### Organize around the immediate decision

Oura's published redesign condensed five navigation tabs into Today, Vitals, and My Health, describing a separation between immediate insights, detailed measurements, and longer-term context. This is a useful commercial precedent for progressive disclosure, not independent evidence that its particular layout improves health. FormChain currently has a single recorded set; it should not manufacture trends, readiness, streaks, or social history to fill a dashboard. [3]

The proposed hierarchy is: current set → selected rep → evidence → optional interpretation → replay. Put one useful next action beside the video, such as “Review rep 3.” Keep exported data and model details available through disclosure. Remove disabled navigation advertising planned features. Once motion replay exists, expose it as a real section in the same session.

### Make the chart an instrument for review

Apple's chart guidance emphasizes a small number of useful insights, meaningful axes, clear descriptions, and accessible interpretation. Its CareKit guidance specifically stresses time units and readable groupings. FormChain's original chart lacks a time axis, displays a single surviving rep below five valleys, and visually disconnects the waveform from video playback. Add seconds, shaded rep intervals, a cursor, and a textual selected-rep summary. Provide keyboard-accessible rep buttons as an alternative to interacting with the graphic. [4,5]

Preserve a stable 0–180° scale so that depth differences cannot be exaggerated by automatic zoom. Do not connect a line across missing tracking. Label the measurement “Camera-view knee angle” because it is projected image geometry. A lower number is not automatically healthier, safer, or more correct; the chart describes observed movement.

### Trust requires understandable limits and control

Google PAIR's guidance distinguishes helpful confidence communication from numerical percentages people cannot interpret. It recommends explanations and avenues for control when predictions are uncertain. A percent “form quality” score is particularly easy to misread as an objective assessment. Remove the prominent score ring. Keep camera coverage visible as “Body tracked in X% of frames,” explicitly describing what the percentage measures. Gemini confidence belongs with its own review, not the local detector. [6]

The report should distinguish a detected cycle, an estimated joint metric, a model interpretation, and a generated demonstration. Each has a different source and reliability. Keep the video and skeleton overlay toggles under the person's control. Make cloud sharing an explicit action with a short description of which images leave the device. Do not silently turn a model-generated animation into evidence of the original workout.

### Accessibility is part of the design system

WCAG 2.2 AA sets a 24-by-24 CSS pixel minimum pointer target, with defined spacing and other exceptions. This is a compliance floor; FormChain will use at least 44 px tall primary controls and repetition selectors as a practical touch design target. This choice exceeds that minimum and is not a claim that WCAG AA requires 44 px. [7]

WCAG requires at least 4.5:1 contrast for ordinary text, with a 3:1 threshold for qualifying large text. Contrast alone does not establish accessibility. Check keyboard access, names for controls, visible focus, reduced motion, status announcements, chart alternatives, and narrow-screen reflow. Use text and selection state in addition to color. Avoid showing a red “failed rep” simply because the movement has a smaller range. [8]

## Proposed visual system

| Element     | Decision                                                                            | Purpose                                                                                      |
| ----------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Canvas      | Warm off-white                                                                      | Give the video and chart distinct, readable boundaries without a wall of cards               |
| Text        | Deep forest, muted gray-green for secondary text                                    | Maintain hierarchy with sufficient contrast                                                  |
| Accent      | Muted clay for the measured trace; forest for actions                               | Separate observed data from interaction                                                      |
| Typography  | System sans for controls and numbers; restrained editorial serif for the page title | Combine familiar controls with an identifiable visual voice without external font dependence |
| Layout      | Simple top navigation; wide video and adjacent set summary                          | Keep the actual workout central                                                              |
| Containers  | Borders only where they group evidence or controls                                  | Reduce repeated decorative framing                                                           |
| Numbers     | Tabular digits and explicit units                                                   | Make comparisons easier                                                                      |
| Motion      | User-controlled playback; reduced-motion support                                    | Avoid distracting or mandatory animation                                                     |
| Empty state | Clear recording guidance and a visibly labeled sample                               | Explain the task without inventing personal data                                             |

The color palette is a design judgment. None of the sources establishes that cream or green alone improves wellbeing. The distinctive quality should come from task-specific composition: a film review surface, rep intervals, contact-sheet frames, and precise observations.

## Interaction specification

On entry, show “Review your squat,” a file control, and concise instructions: one person, full body visible, stable camera, start and finish standing. Explain the 3–30 second clip limit before selection. Keep a sample accessible but label it as synthetic everywhere results are shown.

After analysis, display the total detected count prominently. Selecting a rep updates the video position, highlighted waveform region, lowering/rising duration, camera-view angle, and the three phase frames. Extract phase frames for every detected rep. Cloud coaching still sends a bounded selection of six frames spanning the set; the review should never imply the model saw the complete video.

The first observation should help the person inspect the set, not automatically tell them to change their body. Retain other observations under a disclosure. If evidence is insufficient, explain what the camera needs rather than displaying a zero. Include detection diagnostics in a details section and export so future disagreements can be investigated.

For motion replay, start with the selected rep's duration and a controlled squat description. A generated skeleton should be labeled “Generated demonstration.” A camera-space landmark inspection remains separate. No corrective or safety claim should be inferred from plausibility of the animation. Kimodo installation and its Linux/GPU and text-encoder requirements make live generation an infrastructure dependency, not a browser styling concern. [9]

## Alternatives considered

A dark sports-performance dashboard is effective for some performance contexts, but this implementation used dense framing without the rich longitudinal data such a dashboard needs. The requested wellbeing direction is better served by a quieter review experience. A full clinical portal would overstate the product's role. A lifestyle landing page full of photography would displace the user's own footage and leave the analysis workflow unresolved.

Activity rings are also a poor fit for the current score. They suggest validated progress against a target, while FormChain has neither an individualized target nor validated scoring. Oura's scores are not a license to copy its scoring semantics. The prototype should expose what it actually measures.

## Acceptance and remaining research

Software checks must confirm five repetitions in the supplied 14.4-second clip, every rep selectable, all phase frames available, and no visual bridge across missing tracking. The previous detector's depth and minimum phase-duration gates should be removed from counting. Counting and coaching need independent tests so a quality change cannot silently delete repetitions again.

Visual review must cover desktop and a 390 px phone, visible focus, readable labels, no page-width overflow, and honest unconfigured states. An automated accessibility scan is useful but cannot establish clinical usability. Before presenting the product as a reliable coach, conduct task-based sessions with several exercisers of different experience levels. Ask them to find a specific repetition, explain what a metric means, and identify which data was shared. Record completion errors and mistaken interpretations rather than relying only on aesthetic preference.

This review combines primary design guidance with a commercial product precedent and direct examination of the existing interface. It does not include user interviews, a controlled study, or evidence that the new look changes exercise adherence. The redesign is a testable product hypothesis supported by readability, accessibility, and AI-interaction principles.

## Sources

1. NHS digital service manual, [Typography](https://service-manual.nhs.uk/design-system/styles/typography), live guidance accessed September 12, 2026.
2. NHS digital service manual, [How we write](https://service-manual.nhs.uk/content/how-we-write), page updated August 2019; accessed September 12, 2026.
3. Oura, [Introducing the New Oura App Design](https://ouraring.com/blog/new-oura-app-experience/), October 2024 product announcement; accessed September 12, 2026. Commercial design precedent, not independent outcome research.
4. Apple, [Charts](https://developer.apple.com/design/human-interface-guidelines/charts), Human Interface Guidelines, accessed September 12, 2026.
5. Apple, [CareKit](https://developer.apple.com/design/human-interface-guidelines/carekit), Human Interface Guidelines, accessed September 12, 2026.
6. Google PAIR, [People + AI Guidebook patterns](https://pair.withgoogle.com/guidebook-v2/patterns), living guidance, accessed September 12, 2026.
7. W3C WAI, [Understanding WCAG 2.2 SC 2.5.8: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), accessed September 12, 2026.
8. W3C WAI, [Understanding SC 1.4.3: Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), accessed September 12, 2026.
9. NVIDIA, [Kimodo installation](https://research.nvidia.com/labs/sil/projects/kimodo/docs/getting_started/installation.html), accessed September 12, 2026. Current repository source also supports remote text encoding; installed-version behavior must be verified.
