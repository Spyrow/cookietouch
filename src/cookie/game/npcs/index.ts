import Account from "@/account";
import { AccountStates } from "@/account/AccountStates";
import NpcEntry from "@/game/map/entities/NpcEntry";
import LiteEvent from "@/utils/LiteEvent";

export default class Npcs {
  public possibleReplies: number[] = [];

  private account: Account;
  private readonly onDialogCreated = new LiteEvent<void>();
  private readonly onQuestionReceived = new LiteEvent<void>();
  private readonly onDialogLeft = new LiteEvent<void>();

  constructor(account: Account) {
    this.account = account;
  }

  public get DialogCreated() {
    return this.onDialogCreated.expose();
  }

  public get QuestionReceived() {
    return this.onQuestionReceived.expose();
  }

  public get DialogLeft() {
    return this.onDialogLeft.expose();
  }

  public reply(replyId: number): boolean {
    if (this.account.state !== AccountStates.TALKING) {
      return false;
    }

    // In case it's an index
    if (replyId < 0) {
      replyId = replyId * -1 - 1;

      if (this.possibleReplies.length <= replyId) {
        return false;
      }

      replyId = this.possibleReplies[replyId];
    }

    if (this.possibleReplies.includes(replyId)) {
      this.account.network.sendMessageFree("NpcDialogReplyMessage", {
        replyId
      });
      return true;
    }

    return false;
  }

  public useNpc(npcId: number, actionIndex: number): boolean {
    if (this.account.isBusy) {
      return false;
    }
    // In case the actionIndex is negative
    actionIndex--;
    if (actionIndex < 0) {
      return false;
    }
    let npc: NpcEntry | undefined;
    const npcs = this.account.game.map.npcs;

    // In case the npcId is negative
    if (npcId < 0) {
      const index = npcId * -1 - 1;

      // Check if the index is invalid
      if (npcs.length <= index) {
        return false;
      }
      npc = npcs[index];
    } else {
      npc = npcs.find(n => n.npcId === npcId);
    }

    // Npc not found
    if (!npc) {
      return false;
    }
    // Check if the npc has the action that we want
    if (npc.data.actions.length <= actionIndex) {
      return false;
    }
    this.account.network.sendMessageFree("NpcGenericActionRequestMessage", {
      npcActionId: npc.data.actions[actionIndex],
      npcId: npc.id,
      npcMapId: this.account.game.map.id
    });
    return true;
  }

  public async UpdateNpcDialogCreationMessage(message: any) {
    this.account.state = AccountStates.TALKING;
    this.onDialogCreated.trigger();
  }

  public async UpdateNpcDialogQuestionMessage(message: any) {
    if (this.account.state !== AccountStates.TALKING) {
      return;
    }

    this.possibleReplies = message.visibleReplies;
    this.onQuestionReceived.trigger();
  }

  public async UpdateLeaveDialogMessage(message: any) {
    if (this.account.state !== AccountStates.TALKING) {
      return;
    }

    this.account.state = AccountStates.NONE;
    this.possibleReplies = [];
    this.onDialogLeft.trigger();
  }
}
