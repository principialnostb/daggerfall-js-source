local core = require("openmw.core")
local types = require("openmw.types")
local world = require("openmw.world")
local util = require("openmw.util")
local async = require("openmw.async")
local storage = require("openmw.storage")
--	local aux_util = require("openmw_aux.util")
local I = require("openmw.interfaces")


require("openmw.interfaces").Settings.registerGroup({
	key = "Settings_ODAR_cat10",
	page = "ODAR_main",
	l10n = "DynamicAnimations",
	name = "settings_global_name",
	permanentStorage = true,
	settings = {
		{
			key = "odarEnabled",
			default = true,
			renderer = "checkbox",
			name = "settings_global_01_name",
		},
		{
			key = "npcAnimations",
			default = true,
			renderer = "checkbox",
			name = "settings_global_02_name",
		},
		{
			key = "npcWander",
			default = true,
			renderer = "checkbox",
			name = "settings_global_03_name",
			description = "settings_global_03_desc",
		},
		{
			key = "noShieldSheathing",
			default = false,
			renderer = "checkbox",
			name = "settings_global_04_name",
			description = "settings_global_04_desc",
		},
	},
})


local presets, npcTable, allowedModels = table.unpack(require("scripts.DynamicAnimations.configGlobal"))

local filters = {
	guard = { "ordinator", "crusader", "master-at-arms" }
}

for _, filter in pairs(filters) do
	for _, v in ipairs(filter) do		filter[v] = true		end
end

local paths = {
	fixBlend = "scripts.DynamicAnimations.npcBlendMask",
	replacer = "scripts.DynamicAnimations.npcAnimations",
}

local actors, actorStates, actorByRecord = {}, {}, {}
local teleport = { n=0 }
local npcLookup = {}
local noUpdate = true
local player = world.players[1]		presets.odar_config.player = player

local logLevel = 0
local disabled = false


local settings = storage.globalSection("Settings_ODAR_cat10")
local config = settings:asTable()

config.update = function(_, key)
	if key then
		config[key] = settings:get(key)
	--	print(key, config[key])
	end
	disabled = config.odarEnabled == false
	local m = presets.odar_config
	m.anims = config.npcAnimations
	m.move = config.npcWander
	m.shields = config.noShieldSheathing
end

config.update()
settings:subscribe(async:callback(config.update))


local function debug(m, level)
	if logLevel >= (level or 1) then print(m)		end
end

local function tableCopy(from, to)
	if not from or not to then		return		end
	for k, v in next, from do		to[k] = v	end
end

local function getFaction(o)
	local f = types.NPC.getFactions(o)
	return f[1] ~= nil and f[1] or ""
end

local function getAnimOverride(model)
	local i, j = string.find(model, "/[^/]*$")
	return i and allowedModels[string.sub(model, i+1, j)] or npcTable.odar_ignore
end

local function initStaticActor(o, swaps)
	local t = swaps.settings.teleport
	if t and o.enabled and o.count > 0 and (o.position - t):length() < 128 then
		print(o.enabled, o:isValid(), o.count)
		swaps.odar_ignore = true
		table.insert(teleport, {object=o, position=t, cell=o.cell})
		teleport.n = #teleport
		noUpdate = false
	end
end

local function getReference(id)
	for _, v in next, actorStates do
		if v.actor.recordId == id then
			actorByRecord[id] = v.actor
			return v.actor
		end
	end
end

local function getSwapByTags(o)
	local npc = { odar_config = presets.odar_config }
	local id = o.recordId
	local rec = types.NPC.records[id]	npcLookup[id] = npc
	local name = rec.name:lower()
	if name:find("mannequin") then
		npc.odar_ignore = true
		return npc
	end
	if npcTable[id] then
		tableCopy(npcTable[id], npc)
		npc.odar_custom = true
	else
		tableCopy(allowedModels[rec.model] or npcTable.odar_ignore, npc)
	end
	if npc.odar_custom then		return npc		end

	local isMale = rec.isMale		local class = rec.class
	local guard = false
	if isMale then
		tableCopy(presets.odar_male, npc)
		debug("MALE DEFAULT")
	end

	if id:find("imperial guard") then
		tableCopy(npcTable["odar_guard_imp"], npc)
		guard = true
	elseif id:find("ordinator") or name:find("ordinator") then
		tableCopy(npcTable["odar_guard_ord"], npc)
		tableCopy( presets.static_ord, npc)
		guard = true
	elseif class:find("guard") or filters.guard[class] then
		tableCopy(npcTable["odar_guard"], npc)
		guard = true
	elseif getFaction(o) == "imperial legion" and (class:find("warrior") or class:find("battle")) then
		tableCopy(npcTable["odar_guard_imp"], npc)
		guard = true
	end
	if rec.mwscript then
		local mw = world.mwscript.getLocalScript(o, player).variables
		if mw and mw.companion then
			tableCopy( presets.companion, npc)
		end
	end

	if not isMale then
		if class:find("noble") or class:find("merchant") or rec.race == "high elf" then
			tableCopy(presets.odar_noble_f, npc)
		elseif guard then
			tableCopy(npcTable.odar_guard_f, npc)
		else
			tableCopy(presets.odar_female, npc)
			debug("FEMALE DEFAULT")
		end
	end
	if npc.animKna then
		npc.walkforward_05 = presets.kna05
		npc.walkforward_07 = presets.kna07
		npc.odar_wander = presets.kna
		npc.odar_idle1_idles = nil
		if npc.idle2 then		npc.idle2.interval = 15			end
		npc.idle = npc.idle or {}	tableCopy(presets.speed05, npc.idle)
	elseif isMale then
		npc.walkforward_05 = npc.walkforward_05 or presets.m05
		npc.walkforward_07 = (guard and presets.march_m07) or npc.walkforward_07 or presets.m07
		npc.odar_wander = guard and presets.march_m or npc.odar_wander or presets.m
	else
		npc.walkforward_05 = npc.walkforward_05 or presets.f05
		npc.walkforward_07 = (guard and presets.march_f07) or npc.walkforward_07 or presets.f07
		npc.odar_wander = guard and presets.march_f or npc.odar_wander or presets.f
	end
	npc.odar_wander.maxSpeed = npc.odar_wander.maxSpeed or 138
--	npc.odar_wander.maxSpeed = npc.odar_wander.maxSpeed or (guard and 0.9) or 0.7

--	print("New ODAR entry "..rec.id)
	return npc
end

local function addModule(o, script)
	local a = actors[o.id]
	if not a then
		a = { scripts={} }		actors[o.id] = a
	end
	if not a[script] then
		debug(script.." script added")
		table.insert(a.scripts, paths[script])
		a[script] = true
	end
end

local function onActorActive(o)
	if disabled or not types.NPC.objectIsInstance(o) then
		return
	end
	if types.Actor.isDead(o) then			return		end
	local swaps = npcLookup[o.recordId] or getSwapByTags(o)
	if swaps.settings then		initStaticActor(o, swaps)	end
	if swaps.odar_ignore then			return		end

	if actors[o.id] then
		o:sendEvent("odarAddScript", actors[o.id].scripts)
		return
	end

	if next(swaps) then
		addModule(o, "replacer")
		actors[o.id].scripts.initData = swaps
	end
	local rec = types.NPC.records[o.recordId]
	if not rec.isMale and not types.NPC.races.record(rec.race).isBeast then
		addModule(o, "fixBlend")
	end
	presets.odar_config.random = math.random()
	o:sendEvent("odarAddScript", actors[o.id].scripts)
end

local timer = 5

local function onUpdate(dt)
	if dt == 0 or noUpdate then		return		end
	for i = teleport.n, 1, -1 do
		local o = teleport[i].object
		if not o.enabled or o.count == 0 then
			table.remove(teleport, i)
			teleport.n = #teleport
			print("INVALID: HELD ACTOR", o.enabled, o:isValid(), o.count)
			timer = -1
		else
			o:teleport(o.cell, teleport[i].position)
		end
	end
	timer = timer - dt	if timer > 0 then	return		end
	timer = 4 + math.random(200) / 100

	local active = {}
	for _, v in ipairs(world.activeActors) do active[v.id] = true		end
	for i = #teleport, 1, -1 do
		local o = teleport[i].object
		if not active[o.id] then
			table.remove(teleport, i)
			print("INACTIVE: HELD ACTOR")
		end
	end
	teleport.n = #teleport
	if teleport.n == 0 then
		noUpdate = true
		print("CLEARED STATIC-ACTOR LIST")
	end
end

return {
	engineHandlers = {
		onActorActive = onActorActive,
		onUpdate = onUpdate,
		onPlayerAdded = function(o)
			player = o		presets.odar_config.player = o
		end
	},
	eventHandlers = {
		sendSwaps = function(o)
			if o then onActorActive(o)		end
		end,
		odar_StaticActor = function(e)
			if e.remove then
				for i = #teleport, 1, -1 do
					if teleport[i].object == e.object then
						table.remove(teleport, i)
					end
				end
			else
				table.insert(teleport, {object=e.object, position=e.position})
				noUpdate = false
			end
		end,
		odar_updateActor = function(e)
			if not e or not e.actor then		return		end
			actorStates[e.actor.id] = e
			e.lastUpdateTime = core.getSimulationTime()
		--	print(aux_util.deepToString(e, 3))
		--	print("GLOBAL", e.actor)
		end,
		odar_enabled = function(e)
			I.ODAR.enabled(e)
		end
	},
	interfaceName = "ODAR",
	interface = {
		version = 115,
		getActorState = function(o)
			return actorStates[o.id]
		end,
		getActorByRecord = function(id)
			id = id:lower()
			return actorByRecord[id] or getReference(id)
		end,
		rescanActors = function(o)
			if o then
				onActorActive(o)
			else
				for _, v in ipairs(world.activeActors) do onActorActive(v)		end
			end
		end,
		rebootAI = function(o)
			if o then
				o:sendEvent("odarEvent", { event="rebootAI" })
			else
				for _, v in ipairs(world.activeActors) do
				--	if actors[v.id] then
						v:sendEvent("odarEvent", { event="rebootAI" })
				--	end
				end
			end
		end,
		enabled = function(f, o)
			assert(world.isWorldPaused(), "Debug commands can only be run in the console.")
			f = not (f == false)
			if o then
				o:sendEvent("odarEnabled", f)
			else
				local n = 0
				disabled = not f
				for _, v in ipairs(world.activeActors) do
					if v.type == types.NPC then
						v:sendEvent("odarEnabled", f)
						n = n + 1
					end
				end
				local msg = "ODAR "..(f and "enabled" or "disabled").." "..n.." actors"
				print(msg)		player:sendEvent("DynamicAnimations", msg)
			end
		end,
		actor_setStaticPos = function(e)
			if e.remove then
				for i = #teleport, 1, -1 do
					if teleport[i].object == e.object then
						table.remove(teleport, i)
					end
				end
			else
				table.insert(teleport, {object=e.object, position=e.position})
				noUpdate = false
			end
			teleport.n = #teleport
		end,
		logLevel = function(m)		logLevel = m		end,
--[[
		showSwaps = function()		return npcLookup	end,
		actors = function()		return actors		end,
		states = function()		return actorStates	end,
		record = function()		return actorByRecord	end,

		showPresets = function()	return presets		end,
		showConfig = function()		return config		end
--]]
	}
}

