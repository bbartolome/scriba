# Scriba

A visual writing harness that helps one author turn raw material into a publishable book with an LLM agent, narrative tools and a node canvas.

## Graphs

**Story graph**:
An inert map of a book's structure: scenes, beats and entities joined by relations. It is viewed and edited, never run.
_Avoid_: Scene map, plot graph, story recipe

**Recipe**:
A reusable graph of tool steps that describes how a piece of the book (typically a chapter) is produced. It is the only kind of graph that runs.
_Avoid_: Pipeline, workflow, recipe graph instance, chapter recipe

**Story node**:
A scene, beat or entity on the story graph. It points at a project file, or is a label only while nothing has been written yet.
_Avoid_: Card, story block

**Scene**:
A unit of the book's prose, written as a draft file. The author chooses whether a draft holds one scene or a whole chapter of them.
_Avoid_: Section, passage, scene entity

**Beat**:
A single story moment within a scene, usually just a short line on the story graph rather than written prose.
_Avoid_: Plot point, step

**Relation**:
A directed, named link between two story nodes, such as order, causality or containment.
_Avoid_: Story edge type, link type

**Input node**:
A recipe step that stands for a value the author chooses each time the recipe runs.
_Avoid_: Parameter node, source node

**Tool node**:
A recipe step that calls one registered tool, with its fixed settings.
_Avoid_: Action node, function node

**Output node**:
A recipe step whose value is proposed to the author as a pending change.
_Avoid_: Sink, result node

**Wire**:
A recipe connection that carries a value from one step's output to another step's input.
_Avoid_: Recipe edge, link

**Run**:
One execution of a recipe, or of part of it, with values chosen for its input nodes.
_Avoid_: Job, execution

## Review

**Pending change**:
A proposed edit to a project file that waits for the author to accept or reject it.
_Avoid_: Draft change, suggestion, proposal

## Agent

**Agent run**:
One execution of the agent loop for an author's intent. It calls the project's tools and proposes its writes as pending changes. Its pending changes carry the run's origin.
_Avoid_: Run (that word is for recipes), session, job
