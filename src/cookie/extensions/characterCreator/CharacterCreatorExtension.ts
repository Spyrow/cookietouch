import BreedsUtility from "@/core/BreedsUtility";
import Account from "@account";
import { MapChangeDirections } from "@game/managers/movements/MapChangeDirections";
import DataManager from "@protocol/data";
import Breeds from "@protocol/data/classes/Breeds";
import { CharacterCreationResultEnum } from "@protocol/enums/CharacterCreationResultEnum";
import CharacterCreationResultMessage from "@protocol/network/messages/CharacterCreationResultMessage";
import CharacterNameSuggestionSuccessMessage from "@protocol/network/messages/CharacterNameSuggestionSuccessMessage";
import CharactersListMessage from "@protocol/network/messages/CharactersListMessage";
import GameActionFightSpellCastMessage from "@protocol/network/messages/GameActionFightSpellCastMessage";
import GameEntitiesDispositionMessage from "@protocol/network/messages/GameEntitiesDispositionMessage";
import GameFightStartingMessage from "@protocol/network/messages/GameFightStartingMessage";
import GameMapMovementMessage from "@protocol/network/messages/GameMapMovementMessage";
import QuestStartedMessage from "@protocol/network/messages/QuestStartedMessage";
import QuestStepInfoMessage from "@protocol/network/messages/QuestStepInfoMessage";
import QuestStepValidatedMessage from "@protocol/network/messages/QuestStepValidatedMessage";
import QuestValidatedMessage from "@protocol/network/messages/QuestValidatedMessage";
import QuestActiveDetailedInformations from "@protocol/network/types/QuestActiveDetailedInformations";
import { Deferred, IDeferred } from "@utils/Deferred";
import IClearable from "@utils/IClearable";
import { getRandomInt } from "@utils/Random";
import { sleep } from "@utils/Time";
import { List } from "linqts";
import TutorialHelper from "./TutorialHelper";

export default class CharacterCreatorExtension implements IClearable {
  private account: Account;
  private created: boolean = false;
  private currentItemIndex: number = 0;
  private currentStep: QuestActiveDetailedInformations = null;
  private currentStepNumber: number = 0;
  private inTutorial: boolean = false;
  private name = Deferred<string>();

  get isDoingTutorial() {
    return this.inTutorial && this.currentStep !== null;
  }

  constructor(account: Account) {
    this.account = account;

    this.account.game.npcs.QuestionReceived.on(this.onQuestionReceived.bind(this));
    this.account.game.character.inventory.ObjectEquipped.on(this.onObjectEquipped.bind(this));
    this.account.game.map.MapChanged.on(this.onMapChanged.bind(this));
  }

  public clear() {
    this.created = false;
    this.inTutorial = false;
    this.name = null;
    this.currentStep = null;
    this.currentStepNumber = 0;
    this.currentItemIndex = 0;
  }

  public async UpdateCharactersListMessage(message: CharactersListMessage) {
    if (!this.account.config.characterCreation.create) {
      return;
    }
    // If the character has been successfully created
    if (this.created) {
      // Set the create to false so that we don't create a character each time we connect
      this.account.config.characterCreation.create = false;
      this.account.network.sendMessage("CharacterFirstSelectionMessage", {
        doTutorial: true,
        id: message.characters[0].id,
      });
      return;
    }
    let name = this.account.config.characterCreation.name;
    let max = 0;
    BreedsUtility.breeds.ForEach((b) => b.id > max ? max = b.id : b); // TODO: check this...
    const breed = this.account.config.characterCreation.breed === -1
      ? getRandomInt(1, max + 1)
      : this.account.config.characterCreation.breed;
    const sex = (this.account.config.characterCreation.sex === -1
      ? getRandomInt(0, 2) : this.account.config.characterCreation.sex) === 1;
    const headOrder = this.account.config.characterCreation.head === -1
      ? getRandomInt(0, 8) : this.account.config.characterCreation.head;
    const breedClass = await DataManager.get(Breeds, breed);
    const colors = this.account.config.characterCreation.colors.length === 5
      ? this.account.config.characterCreation.colors.length
      : (sex ? breedClass[0].object.femaleColors : breedClass[0].object.maleColors);
    // If the user wanter a random name, use DT's random name generator
    if (name === "") {
      this.name = Deferred<string>();
      this.account.network.sendMessage("CharacterNameSuggestionRequestMessage");
      name = await this.name.promise;
      this.account.logger.logInfo("CharacterCreator", `Nom de personnage généré: ${name}`);
    }
    await sleep(1000);
    // Send the character creation request message, take in consideration random stuff to generate
    this.account.network.sendMessage("CharacterCreationRequestMessage", {
      breed,
      colors,
      cosmeticId: BreedsUtility.getCosmeticId(breed, sex, headOrder),
      name,
      sex,
    });
  }

  public async UpdateCharacterNameSuggestionSuccessMessage(message: CharacterNameSuggestionSuccessMessage) {
    this.name.resolve(message.suggestion);
  }

  public async UpdateCharacterCreationResultMessage(message: CharacterCreationResultMessage) {
    if (message.result === CharacterCreationResultEnum.OK) {
      this.created = true;
    } else if (message.result === CharacterCreationResultEnum.ERR_NAME_ALREADY_EXISTS) {
      await sleep(1000);
      this.UpdateCharactersListMessage(new CharactersListMessage(false, null));
    } else {
      this.account.logger.logError("CharacterCreator", `Creation Error: ${CharacterCreationResultEnum[message.result]}`);
    }
  }

  public async UpdateQuestStartedMessage(message: QuestStartedMessage) {
    if (!this.account.config.characterCreation.completeTutorial) {
      return;
    }
    if (message.questId !== TutorialHelper.questTutorialId || !this.created) {
      return;
    }
    this.inTutorial = true;
    this.account.network.sendMessage("QuestStepInfoRequestMessage", {
      questId: TutorialHelper.questTutorialId,
    });
  }

  public async UpdateQuestStepInfoMessage(message: QuestStepInfoMessage) {
    if (!this.inTutorial) {
      return;
    }
    if (this.currentStep !== null && this.currentStep.stepId === (message.infos as QuestActiveDetailedInformations).stepId) {
      return;
    }
    this.currentStep = message.infos as QuestActiveDetailedInformations;
    this.currentStepNumber++;
    await sleep(2000);
    this.processTutorialSteps();
  }

  public async UpdateQuestStepValidatedMessage(message: QuestStepValidatedMessage) {
    if (!this.isDoingTutorial || message.questId !== TutorialHelper.questTutorialId) {
      return;
    }

    this.account.network.sendMessage("QuestStepInfoRequestMessage", {
      questId: TutorialHelper.questTutorialId,
    });
  }

  public async UpdateGameMapMovementMessage(message: GameMapMovementMessage) {
    if (!this.isDoingTutorial || message.actorId !== this.account.game.character.id) {
      return;
    }
    if (this.currentStepNumber !== 1 && this.currentStepNumber !== 7) {
      return;
    }
    this.validateCurrentStep();
  }

  public async UpdateGameFightStartingMessage(message: GameFightStartingMessage) {
    if (!this.isDoingTutorial) {
      return;
    }
    if (this.currentStepNumber === 5 || this.currentStepNumber === 12) {
      this.validateCurrentStep();
    }
  }

  public async UpdateGameEntitiesDispositionMessage(message: GameEntitiesDispositionMessage) {
    if (!this.isDoingTutorial) {
      return;
    }
    if (this.currentStepNumber === 6) {
      this.validateCurrentStep();
      await sleep(1000);
      this.account.network.sendMessage("GameFightReadyMessage", { isReady: true });
    }
  }

  public async UpdateGameActionFightSpellCastMessage(message: GameActionFightSpellCastMessage) {
    if (!this.isDoingTutorial || message.sourceId !== this.account.game.character.id) {
      return;
    }
    if (this.currentStepNumber === 8) {
      this.validateCurrentStep();
    }
  }

  public async UpdateQuestValidatedMessage(message: QuestValidatedMessage) {
    if (!this.isDoingTutorial || message.questId !== TutorialHelper.questTutorialId) {
      return;
    }
    this.account.config.characterCreation.completeTutorial = false;
    this.inTutorial = false;
    this.currentStep = null;
  }

  private processTutorialSteps() {
    if (!this.isDoingTutorial) {
      return;
    }
    switch (this.currentStepNumber) {
      // Step 1: Move in the map
      case 1:
        this.account.game.managers.movements.moveToCell(259);
        break;
      // Step 2: Talk and reply to npc
      case 2:
        this.account.game.npcs.useNpc(-1, 1);
        break;
      // Step 3: Equip first item
      case 3:
        this.account.game.character.inventory.equipObject(
          this.account.game.character.inventory.getObjectByGid(TutorialHelper.firstEquipItem),
        );
        break;
      // Step 4: Change map to the right
      case 4:
        this.account.game.managers.movements.changeMap(MapChangeDirections.Right);
        break;
      // Step 5: Start Fight
      case 5:
        this.account.game.managers.movements.moveToCell(this.account.game.map.monstersGroups[0].cellId);
        break;
      // Step 6: Change fight placement
      case 6:
        const cells = this.account.game.fight.positionsForChallengers.Except(new List([this.account.game.fight.playedFighter.cellId])).ToArray();
        this.account.network.sendMessage("GameFightPlacementPositionRequestmessage", {
          cellId: cells[getRandomInt(0, cells.length)],
        });
      // Step 11: Equip second items
      case 11:
        this.currentItemIndex = 0;
        this.account.game.character.inventory.equipObject(
          this.account.game.character.inventory.getObjectByGid(
            TutorialHelper.secondEquipItems[this.currentItemIndex],
          ),
        );
        break;
      // Step 12: Change to map to the right
      case 12:
        this.account.game.managers.movements.changeMap(MapChangeDirections.Right);
        break;
    }
  }

  private validateCurrentStep() {
    if (!this.isDoingTutorial) {
      return;
    }
    for (const t of this.currentStep.objectives) {
      this.account.network.sendMessage("QuestObjectiveValidationMessage", {
        objectiveId: t.objectiveId,
        questId: this.currentStep.questId,
      });
    }
  }

  private onQuestionReceived() {
    if (!this.isDoingTutorial) {
      return;
    }
    // Step 2: Reply to npc
    if (this.currentStepNumber === 2 || this.currentStepNumber === 10 || this.currentStepNumber === 14) {
      this.account.game.npcs.reply(-1);
    }
  }

  private async onObjectEquipped(gid: number) {
    if (!this.isDoingTutorial) {
      return;
    }
    // Step 3: Equip First item
    if (this.currentStepNumber === 3 && gid === TutorialHelper.firstEquipItem) {
      this.validateCurrentStep();
    } else if (this.currentStepNumber === 11 && gid === TutorialHelper.secondEquipItems[this.currentItemIndex]) {
      this.currentItemIndex++;
      if (this.currentItemIndex === TutorialHelper.secondEquipItems.length) {
        this.validateCurrentStep();
      } else {
        await sleep(600);
        this.account.game.character.inventory.equipObject(
          this.account.game.character.inventory.getObjectByGid(
            TutorialHelper.secondEquipItems[this.currentItemIndex],
          ),
        );
      }
    }
  }

  private async onMapChanged() {
    if (!this.isDoingTutorial) {
      return;
    }
    // Step 10: Talk and reply to npc
    if (this.currentStepNumber === 10 && this.account.game.map.id === TutorialHelper.mapIdSecondAfterFight) {
      this.account.logger.logError("CharacterCreator", `(${this.currentStepNumber}) ... Step 10`);
      await sleep(1600);
      console.log("used?", this.account.game.npcs.useNpc(-1, 1));
    } else if (this.currentStepNumber === 14 && this.account.game.map.id === TutorialHelper.mapIdThirdAfterFight) {
      this.account.logger.logError("CharacterCreator", `(${this.currentStepNumber}) ... Step 14`);
      await sleep(1200);
      // Equip hat item
      this.account.game.character.inventory.equipObject(this.account.game.character.inventory.getObjectByGid(10801));
      await sleep(400);
      this.account.game.npcs.useNpc(-1, 1);
    }
    // Step 12: start fight
    if (this.currentStepNumber === 12 && this.account.game.map.id === TutorialHelper.mapIdThirdBeforeFight) {
      this.account.logger.logError("CharacterCreator", `(${this.currentStepNumber}) ... Step 12`);
      this.account.game.managers.movements.moveToCell(this.account.game.map.monstersGroups[0].cellId);
    }
  }
}
