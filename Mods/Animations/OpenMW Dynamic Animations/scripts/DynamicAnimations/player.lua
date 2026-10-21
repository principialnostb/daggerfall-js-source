local core = require("openmw.core")
local anim = require("openmw.animation")
local I = require("openmw.interfaces")
local types = require("openmw.types")
local oSelf = require("openmw.self")
local async = require("openmw.async")
local camera = require("openmw.camera")
local storage = require("openmw.storage")
local ui = require("openmw.ui")
local util = require("openmw.util")

local ctrls = oSelf.controls
local actorSpeed = types.Actor.getCurrentSpeed
local Actor = {
	getWalkSpeed = types.Actor.getWalkSpeed,
	getRunSpeed = types.Actor.getRunSpeed,
	getStance = types.Actor.getStance,
	stanceNone = types.Actor.STANCE.Nothing,
	isSwimming = types.Actor.isSwimming,
	isOnGround = types.Actor.isOnGround,
	activeEffects = types.Actor.activeEffects(oSelf),
	isWerewolf = types.NPC.isWerewolf,
	races = types.NPC.races.records,
	npcRecords = types.NPC.records
}

local logSpam = false

local inFirst = camera.getMode() == camera.MODE.FirstPerson
local noWalking
local skipUpdate = true

local activeOverride
local move = {
	f = "walkforward", f_ = "^walkforward_",
	noble = "walkforward_noble",
	walkSpeed = -1.0, runSpeed = -1.0,
	g="", opt={},
	dynamic = { maxSpeed = 10000 },
	endPoint = 0,
	playOptions = { loops=200, forceLoop=true, priority=5 },
	parentOptions = { loops=200, forceLoop=true, priority=5 },
	slowWalk = { g="walkforward_base13", velocity=130 }
}

local config = require("scripts.DynamicAnimations.configPlayer")
local playerAnims = config.initGroups(move)
local Anim = require("scripts.DynamicAnimations.playerAnimations")

local locomotions = inFirst and Anim.armature.firstPerson or Anim.armature.thirdPerson
Anim.currentArmature = locomotions
local overrides = {}
local disabled = false

local settings = storage.playerSection("Settings_ODAR_cat01")
local function updateSettings()
	disabled = not settings:get("p_odarEnabled")
	local g = playerAnims[settings:get("walkMale") or ""]
	if g and g.g then
		move.custom = { g=g.g, max=10000, velocity=g.velocity or 154 }
		Anim.armature.thirdPerson.walkforward = move.custom
	else
		move.custom = nil
	end
	Anim.animFixes = settings:get("p_useFluidTransitions")
	Anim.enableFirst = settings:get("p_odarEnabled_1st")
--	Anim.enableFirst = settings:get("p_odarEnabled")
	Anim.useLowerSneak = Anim.enableFirst and settings:get("p_useLowerSneak")
	local max = Anim.enableFirst and settings:get("p_maxWalkSpeed") or 10000
	Anim.armature.firstPerson.maxWalk = max
	Anim.armature.firstPerson.maxRun = max * 1.5
	Anim.armature.firstPerson.maxSneak = max * 0.6
	move.walkSpeed = -1.0
end

updateSettings()
settings:subscribe(async:callback(updateSettings))


--	DEV OPTIONS
local logLevel = 0
move.speedAdjust = false



local function debug(m, level)
	if logLevel >= (level or 1) then	print(m)		end
end

local function moveHandler(g, o)
--	print(aux_util.deepToString(o, 3))
	if o.priority ~= 5 or noWalking then
		return
	end

--	move.adjustWalkMask(g, o)
	local clone = {}
	for k, v in pairs(o) do		clone[k] = v		end
	move.playOptions = clone
	activeOverride = overrides[g]
	if not activeOverride then		return		end

	move.speed = actorSpeed(oSelf)		move.velocity = activeOverride.velocity
	o.speed = math.min(activeOverride.max, move.speed) / move.velocity
	move.parent = g			Anim.lastLocomotion.baseGroup = g
	g = activeOverride.g		move.playing = g	Anim.lastLocomotion.g = g
	skipUpdate = false

	-- Account for loco anim restart e.g. switching in/out of spell stance
	if Anim.isPlaying(oSelf, g) then
		o.startPoint = Anim.getCompletion(oSelf, g)
		Anim.cancel(oSelf, g)
	end
--	Anim.playBlended(oSelf, g, o)
	I.AnimationController.playBlendedAnimation(g, o)

	local p = o.priority
	if type(p) == "number" then
		p = { [0] = p, [1] = p, [2] = p, [3] = p }
	end
	p[2] = p[2] - 1			p[3] = p[3] - 1
	o.priority = p			o.blendMask = 0
	if activeOverride.hasSkipKey then
		o.startKey = "skip start"	o.stopKey = "skip stop"
	else
		o.startKey = "start"		o.stopKey = "loop start"
	end
	o.forceLoop = true
	o.speed = 0.2			o.startPoint = 0
	move.parentOptions = o

	Anim.playBlended(oSelf, move.parent, o)
	o.skip = true
	
	return false

end

function Anim.status:update()
	self.isOnGround = Actor.isOnGround(oSelf)
	self.isSwimming = Actor.isSwimming(oSelf)
	self.isFlying = Actor.activeEffects:getEffect("levitate").magnitude > 0
	return disabled or self.isSwimming or self.isFlying or self.isWerewolf
end

local Status = Anim.status
Status:update()

I.ODAR.addPlayBlendedAnimationHandler(function (g, o)
	if not inFirst then		move.adjustAnims(g, o)		end
	noWalking = Status:update()
	if noWalking ~= not Anim.noWalking then
		Anim.noWalking = noWalking
		if noWalking then	Anim.cancelAll()		end
	end
	if not(o.priority == 5 or o.priority == 4 or o.priority == 0) then
		return
	end

	local isLoco = Anim.groups[g]
	if isLoco then
		Anim:locomotionFixes(g, o, isLoco)
		if isLoco.isLocomotion and not isLoco.isSwim then
			move.adjustWalkMask(g, o)
		end
		if locomotions[g] then
			return moveHandler(g, o)
		end
	end
end, "animations")


local function setMaxSpeed(force)
	if noWalking then
		activeOverride = nil
		if not force then
			return
		end
	end
	if move.walkSpeed == Actor.getWalkSpeed(oSelf)
		and move.runSpeed == Actor.getRunSpeed(oSelf)
		and not force then
		return
	end

	debug("MAXSPEEDS UPDATE")
	move.walkSpeed = Actor.getWalkSpeed(oSelf)
	move.runSpeed = Actor.getRunSpeed(oSelf)

	if inFirst then
		if Anim.enableFirst then
			overrides = Anim.getOverrides(move, locomotions, overrides)
		end
		return
	end

	overrides = {}
	local max = move.custom and move.custom.maxSpeed or locomotions.dynamicWalk.maxSpeed
	max = math.min(move.walkSpeed, max)
	local activeWalk = move.custom
			or (move.speedAdjust and max < 154 * 0.75 and move.slowWalk)
			or nil
	overrides.walkforward = activeWalk
	if max == locomotions.maxWalk and not force then
		return
	end

	locomotions.maxWalk = max		move.speed = 0
	debug(("3P MAXSPEED %s"):format(max))
	if not activeWalk then		return		end

	activeWalk.max = max
	local old = move.playing or (Anim.isPlaying(oSelf, move.f) and move.f)
	if old and old ~= activeWalk.g then
		move.playOptions.startPoint = Anim.getCompletion(oSelf, old)
		Anim.cancel(oSelf, old)
		Anim.cancel(oSelf, move.f)
		debug("WALK OVERRIDE")
		moveHandler(move.f, move.playOptions)
	end
end

local timer = math.random(200) / 100
local playerCell = oSelf.cell

local function cellChanged()
	if playerCell ~= oSelf.cell then
		playerCell = oSelf.cell
		if move.speedAdjust and playerCell.id:find(" shack") then
			Anim.armature.thirdPerson.dynamicWalk.maxSpeed = 110
		else
			Anim.armature.thirdPerson.dynamicWalk.maxSpeed = 10000
		end
		setMaxSpeed()
	end
end

Status.changeArmature = function(intoFirst)
	inFirst = intoFirst		Status.inFirst = intoFirst
	if intoFirst then
		locomotions = Anim.armature.firstPerson
	else
		locomotions = Anim.armature.thirdPerson
		async:newUnsavableSimulationTimer(0.1, Anim.zillaScale)
	end
	Anim.currentArmature = locomotions
	Anim.armatureChange = true
	skipUpdate = true		move.playing = nil
	debug("ARMATURE CHANGE", 1)
	if not locomotions.odar_initialized then
	--	print("INITIALIZE " .. (inFirst and "FIRST" or "THIRD"))
		Anim.armature:initialize(locomotions)
	end
	setMaxSpeed(true)
end

local function slowUpdate()
	Status.isWerewolf = Actor.isWerewolf(oSelf)
	if inFirst ~= camera.getMode() == camera.MODE.FirstPerson then
		Status.changeArmature(camera.getMode() == camera.MODE.FirstPerson)
		Anim.armatureChange = false
	end
	noWalking = Status:update()
	if noWalking ~= Anim.noWalking then
		Anim.noWalking = noWalking
		if noWalking then	Anim.cancelAll()		end
	end
	Anim:jumpController()
	cellChanged()
	setMaxSpeed()
	Anim:idleController()
end

local function onUpdate(dt)
	if dt <= 0 then			return			end

	local legs = Anim.getActiveGroup(oSelf, 0)
	local loco = Anim.groups[legs:match("[^_]+")]
	if loco and loco.movement then
		local last = Anim.lastLocomotion
	--	if g ~= last.g then print(last.g, last.time)		end
		if legs == last.g then
			last.endTime = core.getSimulationTime()
			last.endPoint = Anim.getCompletion(oSelf, legs)
		end
	end

	timer = timer - dt
	if timer < 0 then
		timer = 1
		slowUpdate()
	end
	if skipUpdate then		return			end

--[[
	if timer < 1 then
		timer = 5 + math.random(200) / 100
		logSpam = false
	end
--]]

	if not Anim.isPlaying(oSelf, move.parent) then
	--	print(move.parent, move.playing, Actor.getStance(oSelf), ctrls.movement)
	--	print(actorSpeed(oSelf))
		skipUpdate = true
		Anim.cancel(oSelf, move.playing)
		move.playing = nil
		debug("WALK CANCEL", 2)
	elseif not activeOverride then
		skipUpdate = true
		if move.playing then
			move.playOptions.startPoint = Anim.getCompletion(oSelf, move.playing)
			move.playOptions.speed = actorSpeed(oSelf) / 154
			Anim.cancel(oSelf, move.playing)
			Anim.cancel(oSelf, move.parent)
			Anim.playBlended(oSelf, move.parent, move.playOptions)
			move.playing = nil
			debug("WALK RESTART")
		end
	end
	if skipUpdate then		return		end

	if actorSpeed(oSelf) ~= move.speed then
		move.speed = actorSpeed(oSelf)
		Anim.setSpeed(oSelf, move.playing, math.min(activeOverride.max, move.speed) / move.velocity)
	end
end

I.ODAR.addEventHandler("armatureChange", Status.changeArmature)

I.ODAR.addEventHandler("statusChange", function(s)
	Anim.sneakController(s)
	Anim.armatureChange = false
end)

-- fix for camera weirdness when OpenMW is first loaded
async:newUnsavableSimulationTimer(1, function()
	inFirst = camera.getMode() == camera.MODE.FirstPerson
--	print("FORCE REINIT " .. (inFirst and "FIRST" or "THIRD"))
	Anim.armature.firstPerson.odar_initialized = false
	Anim.armature.thirdPerson.odar_initialized = false
	locomotions = inFirst and Anim.armature.firstPerson or Anim.armature.thirdPerson
	Anim.currentArmature = locomotions
	Anim.armature:initialize(locomotions)
	Anim.zillaScale()
	Anim.armatureChange = false
	Anim.animFixes = settings:get("p_useFluidTransitions")
	setMaxSpeed(true)
end)


return {
	engineHandlers = {
		onUpdate = onUpdate,
		onConsoleCommand = function(_, c)
			if not c:find("^lua odar ") then		return		end
			c = c:sub(10, -1):lower()
			local enable = c == "enable"
			if not enable and c ~= "disable" then		return		end
			core.sendGlobalEvent("odar_enabled", enable)
		end
	},
	eventHandlers = {
		UiModeChanged = function(e)
			if e.oldMode == I.UI.MODE.ChargenClassReview then
				debug("RACE FINALIZED")
				playerAnims = config.initGroups(move)		updateSettings()
			end
			cellChanged()
		end,
		DynamicAnimations = function(e)
			ui.printToConsole(e, util.color.hex("ffffff"))
		end
	},

	interfaceName = "dAnim",
	interface = {
		version = 115,

		setMaxSpeed = function(e)
			if not disabled and type(e) == "number" then
				Anim.armature.thirdPerson.dynamicWalk.maxSpeed = e
				setMaxSpeed()
			end
		end,
		setWalk = function(e)
			if not(type(e) == "table") or not(type(e.groupName) == "string") then
				updateSettings()
				setMaxSpeed(true)
				return
			end
			local g = e.groupName:lower()
			local p = playerAnims[g]
			local velocity = e.velocity or (p and p.velocity)
			assert(velocity, "Unregistered group must have a velocity")
			e.maxSpeed = type(e.maxSpeed) == "number" and e.maxSpeed or 10000
			e.g = e.groupName		e.velocity = velocity
			move.custom = e
			setMaxSpeed(true)
		end,
		setLogLevel = function(e)	logLevel = e			end,
		getLocomotions = function()	return playerAnims		end,
		enabled = function(e)		disabled = not e		end,
--[[
		anims = function()		return Anim			end,
		move = function()		return move			end,
		arma = function()		return Anim.armatureChange	end,
		last = function()		return Anim.lastLocomotion	end,

		actor = function()		return Actor			end,
		over = function()		return overrides		end,
		status = function()		return { inFirst }		end,
--]]
	}
}
