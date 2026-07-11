extends CharacterBody2D

signal state_changed(new_state)
signal direction_changed(new_direction)

enum State { IDLE, WALK, SNEAK }

enum Direction {
	RIGHT,
	DOWN_RIGHT,
	DOWN,
	DOWN_LEFT,
	LEFT,
	UP_LEFT,
	UP,
	UP_RIGHT
}

const SPEED: float = 200.0
const SNEAK_MULTIPLIER: float = 0.5

var current_state: State = State.IDLE
var current_direction: Direction = Direction.DOWN
var last_direction_vector: Vector2 = Vector2.DOWN
var is_sneaking: bool = false

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("sneak"):
		is_sneaking = not is_sneaking

func _physics_process(_delta: float) -> void:
	# Input.get_vector handles keyboard deadzones and initial normalization.
	var input_vector: Vector2 = Input.get_vector("move_left", "move_right", "move_up", "move_down")

	if input_vector.length() > 0:
		# Snap to the nearest 45 degrees for strictly 8-directional SNES feel
		var angle: float = input_vector.angle()
		var snapped_angle: float = snapped(angle, PI / 4.0)

		# Rebuild the vector using the snapped angle.
		# By forcing it to be normalized, we ignore partial analog tilt
		# (simulating a pure digital D-pad).
		input_vector = Vector2.RIGHT.rotated(snapped_angle).normalized()

		# Update normalized direction vector
		last_direction_vector = input_vector

		# Update enum direction
		var new_direction: Direction = _vector_to_direction(input_vector)
		if new_direction != current_direction:
			current_direction = new_direction
			direction_changed.emit(current_direction)

		# Determine movement state
		var target_state: State = State.SNEAK if is_sneaking else State.WALK
		_update_state(target_state)

		# Apply velocity
		var current_speed: float = SPEED * (SNEAK_MULTIPLIER if is_sneaking else 1.0)
		velocity = input_vector * current_speed
	else:
		_update_state(State.IDLE)
		velocity = Vector2.ZERO

	move_and_slide()

func _update_state(new_state: State) -> void:
	if current_state != new_state:
		current_state = new_state
		state_changed.emit(current_state)

func _vector_to_direction(vec: Vector2) -> Direction:
	var angle: float = vec.angle()
	# Map angle to an index 0-7
	# PI/4 = 45 degrees. Dividing the angle by PI/4 gives us a value from -4 to 4.
	# wrapi safely wraps the negative values so they correspond to the 0-7 Direction enum.
	var index: int = wrapi(int(round(angle / (PI / 4.0))), 0, 8)
	return index as Direction
