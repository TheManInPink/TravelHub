"""Schéma GraphQL de TravelHub : assemble les Query et Mutation de chaque application."""

import graphene

from apps.accounts import schema as accounts
from apps.itinerary import schema as itinerary
from apps.trips import schema as trips


# graphene lit les classes de base de la dernière à la première. Le schéma affiche
# donc me, myTrips, trip, puis destination et destinationOverview.
class Query(itinerary.Query, trips.Query, accounts.Query, graphene.ObjectType):
    pass


class Mutation(itinerary.Mutation, trips.Mutation, graphene.ObjectType):
    pass


schema = graphene.Schema(query=Query, mutation=Mutation)
